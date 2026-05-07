from dataclasses import dataclass
import os
import requests
from dotenv import load_dotenv

load_dotenv(override=True)


@dataclass
class Proyecto:
    id: int = 0
    ubicacion: str = ""
    nombre_proyecto: str = ""
    descripcion: str = ""

    def __post_init__(self):
        if self.id > 0:
            self.get_from_database()

    def get_from_database(self):
        """Connect to the database using PostgREST and get project data"""
        postgrest_host = os.getenv("POSTGREST_HOST")
        postgrest_port = os.getenv("POSTGREST_PORT")
        url = f"http://{postgrest_host}:{postgrest_port}/proyecto?id=eq.{self.id}"

        try:
            response = requests.get(url)
            response.raise_for_status()
            data = response.json()

            if data and len(data) > 0:
                project_data = data[0]
                self.ubicacion = project_data.get("ubicacion", self.ubicacion)
                self.nombre_proyecto = project_data.get(
                    "nombre_proyecto", self.nombre_proyecto
                )
                self.descripcion = project_data.get("descripcion", self.descripcion)

                return True
            return False

        except requests.exceptions.RequestException as e:
            print(f"Error connecting to database: {str(e)}")
            return False

    def __str__(self) -> str:
        return f"{self.nombre_proyecto}" + (
            f" - {self.ubicacion}" if self.ubicacion else ""
        )


if __name__ == "__main__":
    # Example usage
    proyecto = Proyecto(id=318)
    print(proyecto)
