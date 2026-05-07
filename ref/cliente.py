from PIL import Image
from docx.shared import Pt
from dataclasses import dataclass
from docxtpl import InlineImage
import os
import requests
from dotenv import load_dotenv
from enum import Enum
from rich import print
from general import ImageResize


load_dotenv(override=True)


class TipoFactura(Enum):
    NCF = "FACTURA DE CREDITO FISCAL"
    NCFC = "FACTURA DE CONSUMIDOR FINAL"
    NCG = "FACTURA GUBERNAMENTAL"
    NCRE = "FACTURA DE REGIMEN ESPECIAL"


@dataclass
class Cliente:
    id: int
    nombre: str = None
    nombre_comercial: str = None
    numero: str = None
    correo: str = None
    direccion: str = None
    ciudad: str = None
    provincia: str = None
    telefono: str = None
    representante: str = None
    telefono_representante: str = None
    extension_representante: str = None
    celular_representante: str = None
    correo_representante: str = None
    tipo_factura: TipoFactura = TipoFactura.NCFC
    fecha_actualizacion: str = None
    logo_path: str = None
    logo: Image = None
    inline_logo: InlineImage = None

    def __post_init__(self):
        # Si ID es mayor que 0, cargamos de l2a BD
        if self.id > 0:
            self.get_from_database()
        # Siempre configuramos el logo
        self.set_logo()

    def set_logo(self):
        img_host = os.getenv("IMG_HOST")
        img_port = os.getenv("IMG_PORT")
        img_url = f"http://{img_host}:{img_port}/images/logos/{self.id}"

        # Try to get image from API first
        try:
            response = requests.get(img_url, timeout=1)
            if response.status_code == 200:
                # Create a BytesIO object from the response content
                from io import BytesIO

                image_data = BytesIO(response.content)
                self.logo = Image.open(image_data)

                # Save image to tmp/logos/id.png
                tmp_path = os.path.join(os.getenv("TMP_PATH"), "logos")
                # Create tmp/logos directory if it doesn't exist
                os.makedirs(tmp_path, exist_ok=True)
                tmp_logo_path = os.path.join(tmp_path, f"{self.id}.png")
                self.logo.save(tmp_logo_path, "PNG")

                self.logo_path = tmp_logo_path

                return self.logo
        except Exception as e:
            self.logo_path = f"{os.getenv('ASSETS_PATH')}/cliente.png"
            print(f"poniendo logo por defecto: {self.logo_path}")
            try:
                self.logo = Image.open(self.logo_path)
            except Exception as e2:
                print(f"Error loading default logo: {str(e2)}")
                self.logo = None
            print(f"Error setting logo: {str(e)}")
            return self.logo

    def set_inline_logo(self, tpl):
        if self.logo is None:
            self.logo_path = f"{os.getenv('ASSETS_PATH')}/cliente.png"
            try:
                self.logo = Image.open(self.logo_path)
            except Exception as e:
                print(f"Error loading default logo in set_inline_logo: {str(e)}")
                return
        new_width, new_height = ImageResize(self.logo, 150, 50)
        self.inline_logo = InlineImage(
            tpl,
            self.logo_path,
            height=Pt(new_height),
            width=Pt(new_width),
            anchor="center",
        )

    def get_from_database(self):
        """Connect to the database using PostgREST and get client data"""
        postgrest_host = os.getenv("POSTGREST_HOST")
        postgrest_port = os.getenv("POSTGREST_PORT")
        url = (
            f"http://{postgrest_host}:{postgrest_port}/cliente?select=*&id=eq.{self.id}"
        )

        try:
            response = requests.get(url)
            response.raise_for_status()
            data = response.json()

            if data and len(data) > 0:
                client_data = data[0]
                self.nombre = client_data.get("nombre", self.nombre)
                self.nombre_comercial = client_data.get(
                    "nombre_comercial", self.nombre_comercial
                )
                self.numero = client_data.get("numero", self.numero)
                self.correo = client_data.get("correo", self.correo)
                self.direccion = client_data.get("direccion", self.direccion)
                self.ciudad = client_data.get("ciudad", self.ciudad)
                self.provincia = client_data.get("provincia", self.provincia)
                self.telefono = client_data.get("telefono", self.telefono)
                self.representante = client_data.get(
                    "representante", self.representante
                )
                self.telefono_representante = client_data.get(
                    "telefono_representante", self.telefono_representante
                )
                self.extension_representante = client_data.get(
                    "extension_representante", self.extension_representante
                )
                self.celular_representante = client_data.get(
                    "celular_representante", self.celular_representante
                )
                self.correo_representante = client_data.get(
                    "correo_representante", self.correo_representante
                )
                self.fecha_actualizacion = client_data.get(
                    "fecha_actualizacion", self.fecha_actualizacion
                )

                # Obtener el tipo de factura del cliente
                tipo_factura_db = client_data.get("tipo_factura", "NCFC")
                try:
                    self.tipo_factura = TipoFactura[tipo_factura_db]
                except (KeyError, ValueError):
                    # Si hay error, usar el valor predeterminado
                    self.tipo_factura = TipoFactura.NCFC

                self.set_logo()
                return True
            return False

        except requests.exceptions.RequestException as e:
            print(f"Error connecting to database: {str(e)}")
            return False


if __name__ == "__main__":
    # ID CERO PARA CREAR NUEVO CLIENTE
    cliente = Cliente(id=3)
    print(cliente)
    # cliente.nombre = "Adderly Asuncion"
    # cliente.nombre_comercial = "Adderly Asuncion"
    # cliente.numero = ""
    # cliente.correo = "juanperez@gmail.com"
    # cliente.direccion = ""
    # cliente.ciudad = ""
    # cliente.provincia = ""
    # cliente.save_to_database()
    # print(cliente)
