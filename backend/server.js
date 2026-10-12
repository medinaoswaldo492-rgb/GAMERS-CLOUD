
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

// Permitir peticiones desde tu aplicación React.
app.use(
  cors({
    origin: "http://localhost:5173"
  })
);

// Permitir que Express interprete datos JSON.
app.use(express.json());

// Comprobar que la URL de Google Apps Script esté configurada.
if (!APPS_SCRIPT_URL) {
  console.error("Falta APPS_SCRIPT_URL en el archivo .env");
  process.exit(1);
}

// Enviar solicitudes a Google Apps Script.
async function llamarAppsScript(datos, metodo = "GET") {
  const opciones = {
    method: metodo
  };

  if (metodo === "POST") {
    opciones.headers = {
      "Content-Type": "text/plain;charset=utf-8"
    };

    opciones.body = JSON.stringify(datos);
  }

  const respuesta = await fetch(APPS_SCRIPT_URL, opciones);
  const texto = await respuesta.text();

  let resultado;

  try {
    resultado = JSON.parse(texto);
  } catch {
    throw new Error("Apps Script no devolvió JSON válido.");
  }

  if (!respuesta.ok || resultado.ok === false) {
    throw new Error(
      resultado.mensaje ||
      "Error al consultar Google Sheets."
    );
  }

  return resultado;
}

// Manejar errores de la API.
function manejarError(res, error) {
  console.error(error.message);

  res.status(500).json({
    ok: false,
    mensaje: error.message
  });
}

// Comprobar que el servidor está funcionando.
app.get("/", (req, res) => {
  res.json({
    ok: true,
    mensaje: "API de GAMERS CLOUD funcionando"
  });
});

// READ: consultar todos los videojuegos.
app.get("/api/videojuegos", async (req, res) => {
  try {
    const resultado = await llamarAppsScript();
    res.json(resultado);
  } catch (error) {
    manejarError(res, error);
  }
});

// CREATE: agregar un videojuego.
app.post("/api/videojuegos", async (req, res) => {
  try {
    const resultado = await llamarAppsScript(
      {
        accion: "crear",
        videojuego: req.body
      },
      "POST"
    );

    res.status(201).json(resultado);
  } catch (error) {
    manejarError(res, error);
  }
});

// UPDATE: editar un videojuego.
app.put("/api/videojuegos/:id", async (req, res) => {
  try {
    const resultado = await llamarAppsScript(
      {
        accion: "actualizar",
        videojuego: {
          ...req.body,
          id: req.params.id
        }
      },
      "POST"
    );

    res.json(resultado);
  } catch (error) {
    manejarError(res, error);
  }
});

// DELETE: eliminar un videojuego.
app.delete("/api/videojuegos/:id", async (req, res) => {
  try {
    const resultado = await llamarAppsScript(
      {
        accion: "eliminar",
        id: req.params.id
      },
      "POST"
    );

    res.json(resultado);
  } catch (error) {
    manejarError(res, error);
  }
});

// Iniciar el servidor.
app.listen(PORT, () => {
  console.log(
    `GAMERS CLOUD API: http://localhost:${PORT}`
  );
});
