"""Módulo 6: estadísticas y reportes a partir de los pedidos y los agotamientos."""

import csv
from collections import Counter
from datetime import datetime, time, timedelta

from django.db.models import Avg, Count, F, Sum
from django.db.models.functions import ExtractHour, ExtractIsoWeekDay
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from carta.models import CambioEstado, Plato
from cuentas.permisos import Roles
from pedidos.models import ItemPedido, Pedido

DIAS = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]


def rango(request):
    """Periodo a consultar: ?periodo=dia|semana|mes (por defecto, la semana)."""
    hoy = timezone.localdate()
    periodo = request.query_params.get("periodo", "semana")
    dias = {"dia": 1, "semana": 7, "mes": 30}.get(periodo, 7)
    desde = hoy - timedelta(days=dias - 1)
    tz = timezone.get_current_timezone()
    inicio = timezone.make_aware(datetime.combine(desde, time.min), tz)
    fin = timezone.make_aware(datetime.combine(hoy + timedelta(days=1), time.min), tz)
    return periodo, desde, hoy, inicio, fin


def calcular(restaurante, inicio, fin):
    items = ItemPedido.objects.filter(
        pedido__restaurante=restaurante, pedido__creado__gte=inicio, pedido__creado__lt=fin,
    ).exclude(pedido__estado=Pedido.Estado.CANCELADO)
    pedidos = Pedido.objects.filter(restaurante=restaurante, creado__gte=inicio, creado__lt=fin).exclude(
        estado=Pedido.Estado.CANCELADO
    )

    venta = F("cantidad") * F("precio_unitario")
    costo = F("cantidad") * F("costo_unitario")
    totales = items.aggregate(ventas=Sum(venta), costos=Sum(costo))
    n_pedidos = pedidos.count()
    ventas = totales["ventas"] or 0

    por_hora = dict(
        items.annotate(h=ExtractHour("pedido__creado")).values("h").annotate(v=Sum(venta)).values_list("h", "v")
    )
    por_dia = dict(
        items.annotate(d=ExtractIsoWeekDay("pedido__creado")).values("d").annotate(v=Sum(venta)).values_list("d", "v")
    )

    por_plato = {
        r["plato"]: r for r in items.values("plato").annotate(
            vendidos=Sum("cantidad"), ingreso=Sum(venta), costo_total=Sum(costo)
        )
    }
    calif = dict(
        Plato.objects.filter(restaurante=restaurante).annotate(c=Avg("calificaciones__estrellas"))
        .values_list("id", "c")
    )
    platos = []
    for p in Plato.objects.filter(restaurante=restaurante, activo=True).select_related("categoria"):
        v = por_plato.get(p.id, {})
        platos.append({
            "id": p.id, "nombre": p.nombre, "categoria": p.categoria.nombre, "precio": p.precio,
            "costo": p.costo, "margen": p.margen,
            "margen_pct": round(100 * p.margen / p.precio) if p.precio else 0,
            "cantidad": v.get("vendidos") or 0, "ingreso": v.get("ingreso") or 0,
            "ganancia": (v.get("ingreso") or 0) - (v.get("costo_total") or 0),
            "calificacion": round(calif[p.id], 1) if calif.get(p.id) else None,
        })
    vendidos = sorted(platos, key=lambda x: -x["cantidad"])

    agot = CambioEstado.objects.filter(
        plato__restaurante=restaurante, nuevo=Plato.Estado.AGOTADO, creado__gte=inicio, creado__lt=fin,
    ).select_related("plato")
    agotamientos = {}
    for c in agot:
        a = agotamientos.setdefault(c.plato_id, {"plato": c.plato.nombre, "veces": 0, "horas": Counter()})
        a["veces"] += 1
        a["horas"][timezone.localtime(c.creado).hour] += 1
    agotamientos = sorted(
        ({"plato": a["plato"], "veces": a["veces"], "hora_frecuente": a["horas"].most_common(1)[0][0]}
         for a in agotamientos.values()),
        key=lambda x: -x["veces"],
    )

    return {
        "ventas": ventas,
        "pedidos": n_pedidos,
        "ticket_promedio": round(ventas / n_pedidos) if n_pedidos else 0,
        "ganancia": ventas - (totales["costos"] or 0),
        "por_hora": [{"hora": h, "ventas": por_hora.get(h, 0)} for h in range(6, 23)],
        "por_dia": [{"dia": DIAS[d], "ventas": por_dia.get(d, 0)} for d in range(1, 8)],
        "mas_vendidos": vendidos[:5],
        "menos_vendidos": list(reversed(vendidos[-5:])) if len(vendidos) > 5 else [],
        "agotamientos": agotamientos,
        "platos": sorted(platos, key=lambda x: -x["ganancia"]),
        "por_tipo": list(pedidos.values("tipo").annotate(n=Count("id")).order_by("-n")),
    }


class EstadisticasView(APIView):
    permission_classes = [Roles("admin")]

    def get(self, request):
        periodo, desde, hasta, inicio, fin = rango(request)
        datos = calcular(request.user.restaurante, inicio, fin)
        # Comparación con el periodo anterior del mismo largo.
        largo = fin - inicio
        previo = calcular(request.user.restaurante, inicio - largo, inicio)
        datos["ventas_previas"] = previo["ventas"]
        datos["pedidos_previos"] = previo["pedidos"]
        return Response({"periodo": periodo, "desde": desde, "hasta": hasta, **datos})


class ExportarView(APIView):
    """Exporta el reporte por plato en CSV (se abre directo en Excel)."""

    permission_classes = [Roles("admin")]

    def get(self, request):
        periodo, desde, hasta, inicio, fin = rango(request)
        datos = calcular(request.user.restaurante, inicio, fin)
        resp = HttpResponse(content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="cartasync-{desde}-a-{hasta}.csv"'
        resp.write("﻿")  # BOM para que Excel lea bien las tildes
        w = csv.writer(resp, delimiter=";")
        w.writerow(["Plato", "Categoría", "Precio", "Costo", "Margen %", "Vendidos", "Ingreso", "Ganancia"])
        for p in datos["platos"]:
            w.writerow([p["nombre"], p["categoria"], p["precio"], p["costo"], p["margen_pct"],
                        p["cantidad"], p["ingreso"], p["ganancia"]])
        w.writerow([])
        w.writerow(["Total ventas", datos["ventas"]])
        w.writerow(["Pedidos", datos["pedidos"]])
        return resp


class ResumenSemanalView(APIView):
    """Simula el envío del resumen semanal al correo del dueño."""

    permission_classes = [Roles("admin")]

    def post(self, request):
        correo = request.user.email or "(sin correo registrado)"
        return Response({"ok": True, "enviado_a": correo})
