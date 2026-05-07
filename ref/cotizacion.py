from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import os
import requests
from dotenv import load_dotenv
from db import CategoriaPresupuesto
from PIL import Image
from docxtpl import InlineImage
from docx.shared import Pt
from general import Idioma
from cliente import Cliente
from proyecto import Proyecto
from pres import RenderPresupuesto
from shutil import copyfile
from docxtpl import DocxTemplate
from docx import Document
from docx.shared import Mm
from general import ImageResize, str_formato, str_cuenta, str_tiempo, str_validez
from pres import DatosToDocxTable


load_dotenv(override=True)


class TipoDocumentoCotizacion(Enum):
    COTIZACION = "COTIZACION"
    VOLUMETRIA = "VOLUMETRIA"
    PROPUESTA = "PROPUESTA"
    QUOTATION = "QUOTATION"
    BILL_OF_QUANTITIES = "BILL_OF_QUANTITIES"
    PROPOSAL = "PROPOSAL"


@dataclass
class Cotizacion:
    id: int
    cliente: Cliente = None
    proyecto: Proyecto = None
    descripcion: str = None
    servicio: str = None
    categoria: str = None
    presupuesto: list = field(default_factory=list)
    subtotal: float = 0
    indirectos: float = 0
    moneda: str = "RD$"
    tasa_moneda: float = 1
    tiempo_entrega: int = 0
    avance: int = 0
    validez: int = 0
    retencion: int = 0
    descuentop: float = 0
    descuentom: float = 0
    retencionp: float = 0
    retencionm: float = 0
    itbisp: float = 0
    itbism: float = 0
    total_desc_indirectos: float = 0
    total: float = 0
    notas: dict = field(default_factory=dict)
    idioma: Idioma = Idioma.ES
    tipo: TipoDocumentoCotizacion = TipoDocumentoCotizacion.COTIZACION
    fecha: datetime = field(default_factory=datetime.now)
    tiempo: str = None
    formato: str = None
    cuenta: str = None
    validez: str = None

    def get_from_database(self):
        """Connect to the database using PostgREST and get quotation data"""
        postgrest_host = os.getenv("POSTGREST_HOST")
        postgrest_port = os.getenv("POSTGREST_PORT")
        url = f"http://{postgrest_host}:{postgrest_port}/cotizacion?id=eq.{self.id}"

        try:
            response = requests.get(url)
            response.raise_for_status()
            data = response.json()

            if data and len(data) > 0:
                quote_data = data[0]
                self.cliente = Cliente(id=quote_data.get("id_cliente"))
                self.proyecto = Proyecto(id=quote_data.get("id_proyecto"))
                service_url = f"http://{postgrest_host}:{postgrest_port}/servicio?id=eq.{quote_data.get('id_servicio')}"

                service_response = requests.get(service_url)

                if service_response.status_code == 200:
                    service_data = service_response.json()
                    if service_data and len(service_data) > 0:
                        self.servicio = service_data[0].get("descripcion")
                        self.categoria = service_data[0].get("nombre")

                self.descripcion = quote_data.get("descripcion", self.descripcion)
                self.idioma = Idioma(quote_data.get("idioma", "ES"))

                if quote_data.get("fecha"):
                    fecha = quote_data["fecha"].split("/")
                    mes = fecha[0]
                    dia = fecha[1]
                    ano = fecha[2]
                    self.fecha = datetime.strptime(f"{mes}-{dia}-{ano}", "%m-%d-%Y")

                self.moneda = quote_data.get("moneda", "RD$")
                self.tasa_moneda = quote_data.get("tasa_moneda", 1)
                self.tiempo_entrega = quote_data.get("tiempo_entrega", 0)
                self.avance = quote_data.get("avance", 0)
                self.validez = quote_data.get("validez", 0)
                self.retencion = quote_data.get("retencion", 0)
                self.descuentop = quote_data.get("descuentop", 0)
                self.descuentom = quote_data.get("descuentom", 0)
                self.retencionp = quote_data.get("retencionp", 0)
                self.retencionm = quote_data.get("retencionm", 0)
                self.itbisp = quote_data.get("itbisp", 0)
                self.itbism = quote_data.get("itbism", 0)
                self.total = quote_data.get("total", 0)

                return True
            return False

        except requests.exceptions.RequestException as e:
            print(f"Error connecting to database: {str(e)}")
            return False

    def get_presupuesto(self, tipo: str = "lista"):
        postgrest_host = os.getenv("POSTGREST_HOST")
        postgrest_port = os.getenv("POSTGREST_PORT")
        url = f"http://{postgrest_host}:{postgrest_port}/presupuesto?id_cotizacion=eq.{self.id}"
        response = requests.get(url)
        response.raise_for_status()

        respuesta = response.json()[0].get("presupuesto")

        self.subtotal = 0
        self.indirectos = 0

        lista_presupuestos_from_dict = {"presupuesto": [], "indirectos": []}
        for pres in respuesta["presupuesto"]:
            pres_obj = CategoriaPresupuesto.from_dict(pres)
            self.subtotal += round(pres_obj.get_total(), 2)
            lista_presupuestos_from_dict["presupuesto"].append(pres_obj)
        for pres in respuesta["indirectos"]:
            pres_obj = CategoriaPresupuesto.from_dict(pres)
            self.indirectos += round(pres_obj.get_total(), 2)
            lista_presupuestos_from_dict["indirectos"].append(pres_obj)

        if tipo == "lista":
            self.presupuesto = []

            for pres in lista_presupuestos_from_dict["presupuesto"]:
                self.presupuesto.extend(pres.to_table())
            for pres in lista_presupuestos_from_dict["indirectos"]:
                self.presupuesto.extend(pres.to_table())

            return self.presupuesto
        elif tipo == "objeto":
            self.presupuesto = lista_presupuestos_from_dict
            return self.presupuesto

    def get_total(self):
        self.descuentom = round(self.descuentop / 100 * self.subtotal, 2)
        self.total_desc_indirectos = round(
            self.subtotal + self.indirectos - self.descuentom, 2
        )
        self.itbism = round((self.total_desc_indirectos) * (self.itbisp / 100), 2)
        self.retencionm = round(self.retencionp / 100 * self.itbism, 2)
        self.total = round(
            self.total_desc_indirectos + self.itbism - self.retencionm, 2
        )
        return self.total

    def get_notas(self):
        postgrest_host = os.getenv("POSTGREST_HOST")
        postgrest_port = os.getenv("POSTGREST_PORT")
        url = (
            f"http://{postgrest_host}:{postgrest_port}/notas?id_cotizacion=eq.{self.id}"
        )
        response = requests.get(url)
        response.raise_for_status()
        if response.json():
            self.notas = response.json()[0].get("notas")
        else:
            self.notas = {"1": "", "2": "", "3": "", "4": "", "5": ""}


@dataclass
class CotizacionExistente(Cotizacion):
    def __post_init__(self):
        self.get_from_database()
        self.get_presupuesto()
        self.get_notas()
        self.get_total()


@dataclass
class RenderCotizacion:
    id: int
    dir: str = os.path.join(os.getenv("OUTPUT_PATH"), "cot")
    template_path: str = os.path.join(
        os.getenv("TEMPLATE_PATH"), "COTIZACION TEMPLATE - 1.docx"
    )
    output: str = f"{os.getenv('OUTPUT_PATH')}/cot/tmp.docx"
    tpl: DocxTemplate = None
    logo: Image = field(
        default_factory=lambda: Image.open(
            os.path.join(os.getenv("ASSETS_PATH"), "logo.png")
        )
    )
    qr_code: Image = field(
        default_factory=lambda: Image.open(
            os.path.join(os.getenv("ASSETS_PATH"), "qr_code.png")
        )
    )
    prefijo: str = f"{os.getenv('PREFIJO_COTIZACION')} - "
    pdf_name: str = ""
    pdf_path: str = ""
    inline_qr: InlineImage = None
    inline_logo: InlineImage = None
    doc: Document = field(default_factory=Document)
    data: CotizacionExistente = None
    tiempo: str = None
    formato: str = None
    cuenta: str = None
    validez: str = None

    def __post_init__(self):
        os.makedirs(self.dir, exist_ok=True)
        self.data = CotizacionExistente(id=self.id)
        self.tiempo = str_tiempo(self.data.tiempo_entrega, self.data.idioma)
        self.formato = str_formato(self.data.avance, self.data.idioma)
        self.cuenta = str_cuenta(self.data.moneda, self.data.idioma)
        self.validez = str_validez(self.data.validez, self.data.idioma)

    def copy_template(self):
        self.output = f"{self.dir}/{self.id}.docx"
        copyfile(self.template_path, self.output)

    def set_template(self):
        self.tpl = DocxTemplate(self.output)

    def set_inline_image(self):
        self.inline_qr = InlineImage(
            self.tpl,
            os.path.join(os.getenv("ASSETS_PATH"), "qr_code.png"),
            height=Mm(18),
            width=Mm(18),
        )
        new_width, new_height = ImageResize(self.logo, 150, 80)
        self.inline_logo = InlineImage(
            self.tpl,
            os.path.join(os.getenv("ASSETS_PATH"), "logo.png"),
            height=Pt(new_height),
            width=Pt(new_width),
        )
        self.data.cliente.set_inline_logo(self.tpl)

    def set_idioma_eng(self):
        if self.data.idioma == Idioma.EN:
            if self.data.tipo == TipoDocumentoCotizacion.COTIZACION:
                self.data.tipo = TipoDocumentoCotizacion.QUOTATION
            elif self.data.tipo == TipoDocumentoCotizacion.VOLUMETRIA:
                self.data.tipo = TipoDocumentoCotizacion.BILL_OF_QUANTITIES
            elif self.data.tipo == TipoDocumentoCotizacion.PROPUESTA:
                self.data.tipo = TipoDocumentoCotizacion.PROPOSAL

    def set_idioma_es(self):
        if self.data.idioma == Idioma.ES:
            if self.data.tipo == TipoDocumentoCotizacion.QUOTATION:
                self.data.tipo = TipoDocumentoCotizacion.COTIZACION
            elif self.data.tipo == TipoDocumentoCotizacion.BILL_OF_QUANTITIES:
                self.data.tipo = TipoDocumentoCotizacion.VOLUMETRIA
            elif self.data.tipo == TipoDocumentoCotizacion.PROPOSAL:
                self.data.tipo = TipoDocumentoCotizacion.PROPUESTA

    def render_header(self):
        values_to_render = {
            "TITULO": self.data.tipo.value,
            "ID_COT": str(self.id).zfill(4),
            "ID_CL": str(self.data.cliente.id).zfill(4),
            "CLIENTE": self.data.cliente.nombre.replace("&", "&amp;"),
            "BR": self.data.cliente.nombre_comercial.replace("&", "&amp;"),
            "RNC": self.data.cliente.numero,
            "CONTACTO": self.data.cliente.representante,
            "FECHA": self.data.fecha.strftime("%d-%m-%Y"),
            "ID_P": self.data.proyecto.id,
            "PROYECTO": self.data.proyecto.nombre_proyecto.replace("&", "&amp;"),
            "DESCRIPCION": self.data.descripcion,
            "UBICACIÓN": self.data.proyecto.ubicacion,
            "SERVICIO": self.data.servicio,
            "CAT": self.data.categoria,
            "LOGO_EMPRESA": self.inline_logo,
            "LOGO_CLIENTE": self.data.cliente.inline_logo,
            "QR": self.inline_qr,
        }

        self.tpl.render(values_to_render)
        self.tpl.save(self.output)

    def set_doc(self):
        self.doc = Document(self.output)

    def save_doc(self):
        self.doc.save(self.output)

    def render_presupuesto(self):
        self.doc = RenderPresupuesto(self.doc, self.data.presupuesto, 25).render()

    def agregar_total_cotizacion(self):
        cot_template = os.path.join(
            os.getenv("TEMPLATE_PATH"), "COTIZACION - TEMPLATE - TTL.json"
        )
        documento = DatosToDocxTable(
            doc=self.doc,
            template=cot_template,
            # datos=[]
        )
        # print(documento)
        # self.doc.add_paragraph("")

        return self.doc

    def render_total(self):
        values_to_render = {
            "TIEMPO": self.tiempo,
            "FORMATO_PAGO": self.formato,
            "VALIDEZ": self.validez,
            "SUBTOTAL": f"{self.data.moneda} {'{:,.2f}'.format(self.data.subtotal)}",
            "DESCUENTO_T": f"DESCUENTO {self.data.descuentop}%:"
            if self.data.descuentop > 0
            else "",
            "DESCUENTO": f"{self.data.moneda} {'{:,.2f}'.format(self.data.descuentom)}"
            if self.data.descuentom > 0
            else "",
            "INDIRECTOS_T": "INDIRECTOS:" if self.data.indirectos > 0 else "",
            "INDIRECTOS": f"{self.data.moneda} {'{:,.2f}'.format(self.data.indirectos)}"
            if self.data.indirectos > 0
            else "",
            "TOTAL": f"{self.data.moneda} {'{:,.2f}'.format(self.data.total_desc_indirectos)}",
            "ITBIS": f"{self.data.moneda} {'{:,.2f}'.format(self.data.itbism)}",
            "RETENCION": f"{self.data.moneda} {'{:,.2f}'.format(self.data.retencionm)}",
            "TOTAL_PAGAR": f"{self.data.moneda} {'{:,.2f}'.format(self.data.total)}",
            "CUENTA": self.cuenta,
            "NOTA1": self.data.notas["1"] if self.data.notas["1"] else "",
            "NOTA2": self.data.notas["2"] if self.data.notas["2"] else "",
            "NOTA3": self.data.notas["3"] if self.data.notas["3"] else "",
            "NOTA4": self.data.notas["4"] if self.data.notas["4"] else "",
            "NOTA5": self.data.notas["5"] if self.data.notas["5"] else "",
            "N1": "6" if self.data.notas["1"] else "",
            "N2": "7" if self.data.notas["2"] else "",
            "N3": "8" if self.data.notas["3"] else "",
            "N4": "9" if self.data.notas["4"] else "",
            "N5": "10" if self.data.notas["5"] else "",
        }

        self.tpl.render(values_to_render, autoescape=True)
        self.tpl.save(self.output)

    def imprimir(self):
        self.copy_template()
        self.set_template()
        self.data.cliente.set_inline_logo(self.tpl)
        self.set_inline_image()
        self.render_header()
        self.set_doc()
        self.render_presupuesto()
        self.agregar_total_cotizacion()
        self.save_doc()
        self.set_template()
        self.render_total()


if __name__ == "__main__":
    # Ejemplo de cómo crear una factura a partir de una cotización (50% del total)

    cot = RenderCotizacion(id=555)
    cot.imprimir()
