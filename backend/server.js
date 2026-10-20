
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");

const app = express();
const PORT = process.env.PORT || 3000;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(
  cors({
    origin: [
      "https://gamers-cloud.netlify.app",
      "http://localhost:5173",
    ],
  })
);

app.use(express.json({ limit: "1mb" }));

// Conexion con Google Apps Script.
async function llamarAppsScript(datos, metodo = "GET") {
  if (!APPS_SCRIPT_URL) {
    throw new Error("Falta configurar APPS_SCRIPT_URL.");
  }

  const opciones = { method: metodo };

  if (metodo === "POST") {
    opciones.headers = {
      "Content-Type": "text/plain;charset=utf-8",
    };
    opciones.body = JSON.stringify(datos);
  }

  const respuesta = await fetch(APPS_SCRIPT_URL, opciones);
  const texto = await respuesta.text();

  let resultado;

  try {
    resultado = JSON.parse(texto);
  } catch {
    throw new Error("Apps Script no devolvio JSON valido.");
  }

  if (!respuesta.ok || resultado.ok === false) {
    throw new Error(
      resultado.mensaje || "Error al consultar Google Sheets."
    );
  }

  return resultado;
}

// Manejo de errores generales.
function manejarError(res, error) {
  console.error("Error en la API:", error.message);

  res.status(500).json({
    ok: false,
    mensaje: "No se pudo completar la operacion.",
  });
}

// Comprobar el servidor.
app.get("/", (req, res) => {
  res.json({
    ok: true,
    mensaje: "API de GAMERS CLOUD funcionando",
  });
});

// READ: consultar videojuegos.
app.get("/api/videojuegos", async (req, res) => {
  try {
    const resultado = await llamarAppsScript();
    res.json(resultado);
  } catch (error) {
    manejarError(res, error);
  }
});

// CREATE: agregar videojuego.
app.post("/api/videojuegos", async (req, res) => {
  try {
    const resultado = await llamarAppsScript(
      {
        accion: "crear",
        videojuego: req.body,
      },
      "POST"
    );

    res.status(201).json(resultado);
  } catch (error) {
    manejarError(res, error);
  }
});

// UPDATE: editar videojuego.
app.put("/api/videojuegos/:id", async (req, res) => {
  try {
    const resultado = await llamarAppsScript(
      {
        accion: "actualizar",
        videojuego: {
          ...req.body,
          id: req.params.id,
        },
      },
      "POST"
    );

    res.json(resultado);
  } catch (error) {
    manejarError(res, error);
  }
});

// DELETE: eliminar videojuego.
app.delete("/api/videojuegos/:id", async (req, res) => {
  try {
    const resultado = await llamarAppsScript(
      {
        accion: "eliminar",
        id: req.params.id,
      },
      "POST"
    );

    res.json(resultado);
  } catch (error) {
    manejarError(res, error);
  }
});

// CHAT: generar respuestas con Groq.
async function manejarChat(req, res) {
  try {
    const pregunta =
      typeof req.body?.pregunta === "string"
        ? req.body.pregunta.trim()
        : "";

    if (!pregunta) {
      return res.status(400).json({
        ok: false,
        mensaje: "Escribe una pregunta para el asistente.",
      });
    }

    if (pregunta.length > 1000) {
      return res.status(400).json({
        ok: false,
        mensaje: "La pregunta no puede superar 1000 caracteres.",
      });
    }

    if (!process.env.GROQ_API_KEY) {
      console.error("Falta configurar GROQ_API_KEY en Render.");

      return res.status(503).json({
        ok: false,
        mensaje: "El asistente no esta configurado en el servidor.",
      });
    }

    // Obtener el inventario actual.
    const resultado = await llamarAppsScript();
    const juegos = Array.isArray(resultado.datos)
      ? resultado.datos
      : [];

    const inventario = juegos.map((juego) => ({
      id: juego.id,
      nombre: juego.nombre,
      plataforma: juego.plataforma,
      genero: juego.genero,
      precio: juego.precio,
      stock: juego.stock,
    }));

    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    // Aceptar solamente mensajes recientes de usuario y asistente.
    const historial = Array.isArray(req.body?.historial)
      ? req.body.historial
          .filter(
            (mensaje) =>
              ["user", "assistant"].includes(mensaje.role) &&
              typeof mensaje.content === "string"
          )
          .slice(-10)
          .map((mensaje) => ({
            role: mensaje.role,
            content: mensaje.content.slice(0, 2000),
          }))
      : [];

    // Evitar duplicar la pregunta actual si ya viene en el historial.
    if (
      historial.length > 0 &&
      historial[historial.length - 1].role === "user" &&
      historial[historial.length - 1].content === pregunta
    ) {
      historial.pop();
    }

    const respuestaIA = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content:
            "Eres el asistente virtual de GAMERS CLOUD. " +
            "Responde en español, de forma amable y clara. " +
            "Ayuda con preguntas sobre videojuegos, plataformas, " +
            "generos, precios y existencias. " +
            "Usa el inventario proporcionado como fuente de datos. " +
            "No inventes videojuegos, precios ni cantidades. " +
            "Si no hay datos suficientes, indicalo. " +
            "No afirmes haber agregado, editado o eliminado juegos: " +
            "esta ruta solo permite consultar y responder preguntas.\n\n" +
            "INVENTARIO ACTUAL:\n" +
            JSON.stringify(inventario),
        },
        ...historial,
        {
          role: "user",
          content: pregunta,
        },
      ],
      max_tokens: 500,
    });

    const respuesta =
      respuestaIA.choices?.[0]?.message?.content?.trim();

    if (!respuesta) {
      throw new Error("Groq devolvio una respuesta vacia.");
    }

    res.json({
      ok: true,
      respuesta,
    });
  } catch (error) {
    console.error(
      "Error en el chat:",
      error.status || "",
      error.message,
      error?.error ?? ""
    );

    if (error.status === 429) {
      return res.status(429).json({
        ok: false,
        mensaje:
          "El asistente alcanzo su limite de uso. " +
          "Intentalo mas tarde.",
      });
    }

    if (error.status === 401 || error.status === 403) {
      return res.status(502).json({
        ok: false,
        mensaje:
          "No se pudo autenticar con Groq. Revisa la clave API.",
      });
    }

    res.status(500).json({
      ok: false,
      mensaje:
        "No se pudo generar la respuesta. Intentalo nuevamente.",
    });
  }
}

// Ruta nueva y compatibilidad con la interfaz anterior.
app.post("/api/chat", manejarChat);
app.post("/api/asistente", manejarChat);

// Iniciar servidor.
app.listen(PORT, () => {
  console.log(`GAMERS CLOUD API iniciada en el puerto ${PORT}`);
});

