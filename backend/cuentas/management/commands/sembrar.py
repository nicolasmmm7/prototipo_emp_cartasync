"""Carga datos de ejemplo: Restaurante La Esquina, su carta, usuarios y 5 semanas de ventas.

Uso: python manage.py sembrar          (borra los datos de La Esquina y los vuelve a crear)
"""

import random
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from carta.models import CambioEstado, Calificacion, Categoria, Plato
from cuentas.models import Restaurante, Sede, SolicitudSoporte, Usuario
from inventario.models import Producto
from pedidos.models import EventoPedido, ItemPedido, Mesa, MensajeWhatsApp, Pedido

CLAVE = "cartasync123"

USUARIOS = [
    ("jorge", "Jorge", "Ramírez", "admin", "jorge@laesquina.co"),
    ("rosa", "Rosa", "Pabón", "cocina", ""),
    ("andres", "Andrés", "Gómez", "mesero", ""),
    ("camila", "Camila", "Ortiz", "mesero", ""),
    ("luis", "Luis", "Peña", "caja", ""),
]

# nombre, categoría, precio, costo, qué incluye, cobra aparte, horarios (d,a,c), peso de venta
PLATOS = [
    ("Almuerzo corriente del día", "Menú del día", 15000, 6500,
     "Sopa de verduras, arroz, carne asada, ensalada y jugo del día.", "", (0, 1, 0), 30),
    ("Bandeja paisa", "Platos fuertes", 24000, 11500,
     "Incluye frijoles, arroz, carne molida, chicharrón, huevo, arepa y aguacate.", "", (0, 1, 1), 14),
    ("Sobrebarriga en salsa", "Platos fuertes", 22000, 10000,
     "Incluye arroz, papa criolla y ensalada.", "", (0, 1, 0), 9),
    ("Pechuga a la plancha", "Platos fuertes", 21000, 8500,
     "Incluye arroz, papas a la francesa y ensalada.", "La bebida se cobra aparte.", (0, 1, 1), 11),
    ("Mojarra frita", "Platos fuertes", 26000, 12000,
     "Incluye patacón, arroz con coco y ensalada.", "", (0, 1, 1), 7),
    ("Carne guisada", "Platos fuertes", 19000, 8000,
     "Incluye arroz, papa salada y ensalada.", "", (0, 1, 0), 8),
    ("Cazuela de frijoles", "Platos fuertes", 18000, 7000,
     "Con chicharrón, arroz, aguacate y arepa.", "", (0, 1, 0), 3),
    ("Caldo de costilla", "Sopas", 12000, 4500,
     "Con papa, cilantro y arepa.", "", (1, 1, 0), 8),
    ("Sopa de verduras", "Sopas", 8000, 2500, "Sopa del día con verduras de temporada.", "", (0, 1, 1), 3),
    ("Calentado paisa", "Desayunos", 14000, 5500,
     "Arroz con frijoles, huevo, arepa y chocolate.", "", (1, 0, 0), 6),
    ("Changua", "Desayunos", 9000, 3000, "Con huevo, cilantro y calado.", "", (1, 0, 0), 2),
    ("Limonada natural", "Bebidas", 5000, 1200, "Vaso de 400 ml.", "", (1, 1, 1), 16),
    ("Jugo de mora", "Bebidas", 6000, 1800, "En agua o en leche.", "En leche: $1.000 más.", (1, 1, 1), 10),
]

# Hora del día → peso relativo de pedidos (el pico es al mediodía).
HORAS = {7: 4, 8: 6, 9: 4, 10: 2, 11: 5, 12: 16, 13: 14, 14: 7, 15: 3, 16: 2, 17: 2, 18: 4, 19: 5, 20: 3}


class Command(BaseCommand):
    help = "Carga los datos de ejemplo de Restaurante La Esquina."

    @transaction.atomic
    def handle(self, *args, **opts):
        random.seed(7)
        # Las ventas protegen a los platos y los platos a las categorías: se borra en orden.
        viejo = Restaurante.objects.filter(slug="la-esquina")
        ItemPedido.objects.filter(pedido__restaurante__in=viejo).delete()
        Plato.objects.filter(restaurante__in=viejo).delete()
        Categoria.objects.filter(restaurante__in=viejo).delete()
        viejo.delete()
        Usuario.objects.filter(username__in=[u[0] for u in USUARIOS]).delete()

        hoy = timezone.localdate()
        ahora = timezone.now()
        r = Restaurante.objects.create(
            nombre="Restaurante La Esquina", slug="la-esquina", ciudad="Cúcuta", telefono="607 000 0000",
            menu_del_dia="Almuerzo corriente: sopa de verduras, arroz, carne asada, ensalada y jugo.",
            prueba_hasta=hoy + timedelta(days=18),
        )
        principal = Sede.objects.create(restaurante=r, nombre="Principal · Centro", direccion="Calle 10 #4-20", principal=True)
        Sede.objects.create(restaurante=r, nombre="Terminal de transporte", direccion="Local 112")

        usuarios = {}
        for username, nombre, apellido, rol, email in USUARIOS:
            u = Usuario(username=username, first_name=nombre, last_name=apellido, rol=rol, email=email,
                        restaurante=r, sede=principal, last_login=ahora - timedelta(hours=random.randint(1, 30)))
            u.set_password(CLAVE)
            u.save()
            usuarios[username] = u

        cats = {}
        for i, n in enumerate(["Menú del día", "Platos fuertes", "Sopas", "Desayunos", "Bebidas"]):
            cats[n] = Categoria.objects.create(restaurante=r, nombre=n, orden=i)

        platos, pesos = {}, {}
        for nombre, cat, precio, costo, incluye, aparte, (d, a, c), peso in PLATOS:
            p = Plato.objects.create(
                restaurante=r, categoria=cats[cat], nombre=nombre, precio=precio, costo=costo,
                descripcion=incluye, cobra_aparte=aparte, en_desayuno=bool(d), en_almuerzo=bool(a),
                en_cena=bool(c), es_menu_del_dia=(cat == "Menú del día"),
                estado_cambiado=ahora - timedelta(hours=3),
            )
            platos[nombre], pesos[nombre] = p, peso

        # Alternativas cuando algo se agota, y platos que conviene ofrecer.
        alt = {"Sobrebarriga en salsa": "Carne guisada", "Mojarra frita": "Pechuga a la plancha",
               "Limonada natural": "Jugo de mora", "Bandeja paisa": "Cazuela de frijoles",
               "Caldo de costilla": "Sopa de verduras"}
        for a, b in alt.items():
            platos[a].alternativo = platos[b]
            platos[a].save(update_fields=["alternativo"])
        for n in ["Carne guisada", "Almuerzo corriente del día"]:
            platos[n].destacado = True
            platos[n].save(update_fields=["destacado"])

        # --- Inventario de mostrador e insumos ---
        prods = [
            ("Gaseosa 400 ml", "nevera", "und", 24, 12, 40, False),
            ("Jugo en caja 200 ml", "repisa", "und", 6, 10, 60, False),
            ("Empanadas precocidas", "vitrina", "und", 15, 10, 1, False),
            ("Arroz con leche", "tanque", "L", 2, 3, 2, False),
            ("Agua 600 ml", "nevera", "und", 10, 8, 120, False),
            ("Postre de natas", "vitrina", "und", 4, 4, 1, False),
            ("Limón", "bodega", "und", 0, 20, 6, True),
            ("Mojarra (pescado)", "bodega", "und", 4, 5, 3, True),
        ]
        insumos = {}
        for nombre, ubi, und, ex, mini, vence, insumo in prods:
            insumos[nombre] = Producto.objects.create(
                restaurante=r, nombre=nombre, ubicacion=ubi, unidad=und, existencias=Decimal(ex),
                minimo=Decimal(mini), vence=hoy + timedelta(days=vence), es_insumo=insumo,
            )
        platos["Limonada natural"].insumos.add(insumos["Limón"])
        platos["Mojarra frita"].insumos.add(insumos["Mojarra (pescado)"])

        mesas = [Mesa.objects.create(restaurante=r, numero=n) for n in range(1, 9)]

        # --- Historial: 5 semanas de ventas ---
        tz = timezone.get_current_timezone()
        nombres = list(pesos)
        meseros = [usuarios["andres"], usuarios["camila"]]
        pedidos, items_por_pedido, cambios = [], [], []
        for dias_atras in range(35, -1, -1):
            dia = hoy - timedelta(days=dias_atras)
            base = 55 if dia.weekday() < 5 else 80  # fines de semana hay más gente
            n = int(base * random.uniform(0.85, 1.15))
            for _ in range(n):
                hora = random.choices(list(HORAS), weights=list(HORAS.values()))[0]
                cuando = timezone.make_aware(datetime.combine(dia, time(hora, random.randint(0, 59))), tz)
                if cuando >= ahora - timedelta(minutes=50):
                    continue
                # Lo que se pide depende del servicio.
                candidatos = [x for x in nombres if (
                    platos[x].en_desayuno if hora < 11 else platos[x].en_almuerzo if hora < 17 else platos[x].en_cena)]
                elegidos = random.choices(candidatos, weights=[pesos[x] for x in candidatos], k=random.randint(1, 3))
                tipo = random.choices(["mesa", "llevar", "domicilio", "mostrador"], weights=[60, 15, 15, 10])[0]
                pedidos.append(Pedido(
                    restaurante=r, tipo=tipo, origen="whatsapp" if tipo == "domicilio" else "sala" if tipo == "mesa" else "caja",
                    # Lo que se come en el local (mesa o mostrador) queda en una mesa.
                    mesa=random.choice(mesas) if tipo in ("mesa", "mostrador") else None,
                    creado_por=random.choice(meseros) if tipo == "mesa" else usuarios["luis"],
                    estado="entregado", creado=cuando, en_preparacion_desde=cuando + timedelta(minutes=2),
                    listo_desde=cuando + timedelta(minutes=15), entregado_desde=cuando + timedelta(minutes=18),
                ))
                items_por_pedido.append(elegidos)
            # Agotamientos típicos: la sobrebarriga se acaba casi siempre a la 1, la mojarra a veces.
            if dias_atras > 0:
                for nombre, prob, h in [("Sobrebarriga en salsa", .8, 13), ("Mojarra frita", .45, 13),
                                        ("Caldo de costilla", .35, 12), ("Limonada natural", .2, 14)]:
                    if random.random() < prob:
                        cambios.append(CambioEstado(
                            plato=platos[nombre], anterior="por_agotarse", nuevo="agotado", origen="cocina",
                            creado=timezone.make_aware(datetime.combine(dia, time(h, random.randint(0, 59))), tz)))

        Pedido.objects.bulk_create(pedidos, batch_size=500)
        items = []
        for pedido, elegidos in zip(pedidos, items_por_pedido):
            for nombre in set(elegidos):
                p = platos[nombre]
                items.append(ItemPedido(pedido=pedido, plato=p, cantidad=elegidos.count(nombre),
                                        precio_unitario=p.precio, costo_unitario=p.costo,
                                        estado="listo", listo_en=pedido.listo_desde))
        ItemPedido.objects.bulk_create(items, batch_size=1000)
        CambioEstado.objects.bulk_create(cambios)

        for nombre, p in platos.items():
            for _ in range(random.randint(2, 9)):
                Calificacion.objects.create(plato=p, estrellas=random.choices([3, 4, 5], weights=[1, 3, 5])[0])

        # --- El servicio de hoy, como en los wireframes ---
        estado_hoy = {  # preparadas, restantes
            "Bandeja paisa": (20, 14), "Sobrebarriga en salsa": (15, 0), "Pechuga a la plancha": (15, 9),
            "Mojarra frita": (10, 3), "Almuerzo corriente del día": (40, 22), "Caldo de costilla": (15, 2),
            "Carne guisada": (15, 11), "Limonada natural": (None, None),
        }
        for nombre, (prep, rest) in estado_hoy.items():
            p = platos[nombre]
            p.porciones_preparadas, p.porciones_restantes = prep, rest
            p.save(update_fields=["porciones_preparadas", "porciones_restantes"])
        rosa = usuarios["rosa"]
        for nombre, nuevo, origen, mins, vuelve in [
            ("Limonada natural", "agotado", "inventario", 40, 30),
            ("Caldo de costilla", "por_agotarse", "automatico", 12, None),
            ("Mojarra frita", "por_agotarse", "automatico", 8, None),
            ("Sobrebarriga en salsa", "agotado", "cocina", 2, None),
        ]:
            p = platos[nombre]
            c = p.cambiar_estado(nuevo, origen, rosa if origen == "cocina" else None, vuelve)
            c.creado = ahora - timedelta(minutes=mins)
            c.save(update_fields=["creado"])
            p.estado_cambiado = c.creado
            p.save(update_fields=["estado_cambiado"])

        def pedido_hoy(mesa=None, tipo="mesa", estado="recibido", hace=5, platos_=(), **extra):
            creado = ahora - timedelta(minutes=hace)
            ped = Pedido.objects.create(
                restaurante=r, tipo=tipo, mesa=mesa, estado=estado, creado=creado,
                origen=extra.pop("origen", "sala" if mesa else "caja"),
                creado_por=extra.pop("por", usuarios["andres"]), **extra,
            )
            if estado in ("en_preparacion", "listo", "entregado"):
                ped.en_preparacion_desde = creado + timedelta(minutes=1)
            if estado in ("listo", "entregado"):
                ped.listo_desde = creado + timedelta(minutes=min(hace - 1, 12))
            if estado == "entregado":
                ped.entregado_desde = creado + timedelta(minutes=min(hace - 1, 15))
            ped.save()
            for nombre, cant, nota in platos_:
                p = platos[nombre]
                ItemPedido.objects.create(pedido=ped, plato=p, cantidad=cant, precio_unitario=p.precio,
                                          costo_unitario=p.costo, nota=nota,
                                          estado="listo" if estado in ("listo", "entregado") else "pendiente",
                                          listo_en=ped.listo_desde)
            # Historial del pedido, como si se hubiera ido actualizando durante el servicio.
            detalle = ", ".join(f"{c} × {n}" for n, c, _ in platos_)
            eventos = [(creado, "creado", f"Pedido creado para {ped.etiqueta}: {detalle}", ped.creado_por)]
            if ped.nota:
                eventos.append((creado, "nota", f"Nota para cocina: {ped.nota}", ped.creado_por))
            if ped.en_preparacion_desde:
                eventos.append((ped.en_preparacion_desde, "estado", "La cocina empezó a prepararlo", rosa))
            if ped.listo_desde:
                eventos.append((ped.listo_desde, "estado", "Listo para servir", rosa))
            if ped.entregado_desde:
                eventos.append((ped.entregado_desde, "estado", "Servido / entregado al cliente", ped.creado_por))
            EventoPedido.objects.bulk_create(
                [EventoPedido(pedido=ped, creado=c, tipo=t, texto=x, usuario=u) for c, t, x, u in eventos])
            if mesa and not mesa.abierta_desde:
                mesa.abierta_desde = creado
                mesa.save(update_fields=["abierta_desde"])
            return ped

        m = {x.numero: x for x in mesas}
        p1 = pedido_hoy(m[1], estado="en_preparacion", hace=12, platos_=[
            ("Bandeja paisa", 2, "Una sin chicharrón"), ("Pechuga a la plancha", 1, ""), ("Limonada natural", 3, "")])
        # Avance detallado de la cocina en la mesa 1: un plato listo, tiempo estimado y un problema
        # (se acabó el limón) que el mesero debe resolver cambiando o quitando la limonada.
        def evento(ped, minutos, tipo, texto, usuario):
            EventoPedido.objects.create(pedido=ped, tipo=tipo, texto=texto, usuario=usuario,
                                        creado=ahora - timedelta(minutes=minutos))
        p1.listo_estimado = ahora + timedelta(minutes=6)
        p1.save(update_fields=["listo_estimado"])
        evento(p1, 10, "estimado", f"Sale en unos 16 min (aprox. {timezone.localtime(p1.listo_estimado).strftime('%H:%M')})", rosa)
        pechuga = p1.items.get(plato=platos["Pechuga a la plancha"])
        pechuga.estado, pechuga.listo_en = "listo", ahora - timedelta(minutes=4)
        pechuga.save(update_fields=["estado", "listo_en"])
        evento(p1, 4, "item", "Plato listo: 1 × Pechuga a la plancha (1 de 3)", rosa)
        limonada = p1.items.get(plato=platos["Limonada natural"])
        limonada.estado, limonada.problema = "problema", "Se acabó el limón"
        limonada.save(update_fields=["estado", "problema"])
        evento(p1, 3, "problema", "No se puede preparar 3 × Limonada natural: Se acabó el limón", rosa)
        evento(p1, 2, "mensaje", "Mensaje de cocina: Las bandejas salen en 5 minutos", rosa)
        pedido_hoy(m[2], estado="listo", hace=18, platos_=[("Almuerzo corriente del día", 2, "")], por=usuarios["camila"])
        pedido_hoy(m[4], estado="entregado", hace=35, platos_=[
            ("Carne guisada", 2, ""), ("Caldo de costilla", 2, "")], por=usuarios["camila"])
        pedido_hoy(m[7], estado="recibido", hace=1, platos_=[("Carne guisada", 2, ""), ("Caldo de costilla", 1, "")])
        pedido_hoy(tipo="domicilio", estado="recibido", hace=2, origen="whatsapp", por=usuarios["luis"],
                   cliente="Pedro", telefono="311 000 0000", direccion="Calle 10 #4-32",
                   nota="Sin cebolla en la mojarra", platos_=[("Bandeja paisa", 1, ""), ("Mojarra frita", 1, "")])
        # Venta de mostrador: se pidió y pagó en caja, pero el cliente come en la mesa 6.
        pedido_hoy(m[6], tipo="mostrador", estado="en_preparacion", hace=7, origen="caja", por=usuarios["luis"],
                   cliente="Don Álvaro", platos_=[("Pechuga a la plancha", 1, ""), ("Jugo de mora", 1, "")])
        pedido_hoy(tipo="llevar", estado="en_preparacion", hace=9, por=usuarios["luis"], cliente="Sra. Marta",
                   platos_=[("Almuerzo corriente del día", 3, "")])

        MensajeWhatsApp.objects.create(
            restaurante=r, cliente="Laura", telefono="315 000 0000", direccion="Calle 10 #4-32",
            texto="Hola, me envían una bandeja paisa y una limonada a la Calle 10 #4-32",
            recibido=ahora - timedelta(minutes=3))
        MensajeWhatsApp.objects.create(
            restaurante=r, cliente="Jhon", telefono="300 000 0000", texto="Dos corrientazos para recoger a la 1",
            recibido=ahora - timedelta(minutes=6))

        SolicitudSoporte.objects.create(restaurante=r, tipo="capacitacion", estado="agendada",
                                        descripcion="Capacitación para meseros nuevos")
        SolicitudSoporte.objects.create(restaurante=r, tipo="soporte", estado="resuelta",
                                        descripcion="La pantalla de cocina no actualizó un plato")

        self.stdout.write(self.style.SUCCESS(
            f"Listo: {len(pedidos)} pedidos históricos, {len(platos)} platos, {len(mesas)} mesas.\n"
            f"Usuarios (clave '{CLAVE}'): " + ", ".join(f"{u} ({rol})" for u, _, _, rol, _ in USUARIOS)
        ))
