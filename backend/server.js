
require("dotenv").config();

const express = require("express");
const cors = require("cors");

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

if (!APPS_SCRIPT_URL) {
  console.error("Falta APPS_SCRIPT_URL en las variables de entorno.");
  process.exit(1);
}

// Consultar Google Apps Script y Google Sheets.
async function llamarAppsScript(datos, metodo = "GET") {
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
    throw new Error("Apps Script no devolvió JSON válido.");
  }

  if (!respuesta.ok || resultado.ok === false) {
    throw new Error(
      resultado.mensaje || "Error al consultar Google Sheets."
    );
  }

  return resultado;
}

function manejarError(res, error) {
  console.error(error.message);

  res.status(500).json({
    ok: false,
    mensaje: error.message,
  });
}

// Ruta principal.
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

// CREATE: agregar un videojuego.
app.post("/api/videojuegos", async (req, res) => {
  try {
    const resultado = await llamarAppsScript(
      { accion: "crear", videojuego: req.body },
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

// ASISTENTE: consultar Gemini usando el inventario actual.

app.post("/api/asistente", async (req, res) => {
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

  if (pregunta.length > 500) {
    return res.status(400).json({
      ok: false,
      mensaje: "La pregunta no puede superar los 500 caracteres.",
    });
  }

  try {
    // Obtener el inventario actual.
    const resultado = await llamarAppsScript();

    // Admitir distintas estructuras de respuesta.
    const filas = Array.isArray(resultado)
      ? resultado
      : Array.isArray(resultado?.datos)
        ? resultado.datos
        : Array.isArray(resultado?.videojuegos)
          ? resultado.videojuegos
          : Array.isArray(resultado?.data)
            ? resultado.data
            : [];

    console.log(
      `Videojuegos recibidos por el asistente: ${filas.length}`
    );

    if (filas.length === 0) {
      return res.status(500).json({
        ok: false,
        mensaje:
          "El inventario está vacío o la respuesta de Google Apps Script no contiene una lista de videojuegos.",
      });
    }

    const juegos = filas.map((juego) => ({
      id: juego.id ?? "",
      nombre: String(juego.nombre ?? "Sin nombre"),
      plataforma: String(juego.plataforma ?? "No especificada"),
      genero: String(juego.genero ?? "No especificado"),
      precio: Number(juego.precio) || 0,
      stock: Number(juego.stock) || 0,
    }));

    const preguntaNormalizada = pregunta.toLowerCase();

    // Responder directamente las preguntas sobre mayores existencias.
    const preguntaSobreStock =
      preguntaNormalizada.includes("stock") ||
      preguntaNormalizada.includes("existencias") ||
      preguntaNormalizada.includes("unidades disponibles");

    const preguntaSobreMayorCantidad =
      preguntaNormalizada.includes("más") ||
      preguntaNormalizada.includes("mayor") ||
      preguntaNormalizada.includes("máximo") ||
      preguntaNormalizada.includes("mayores");

    if (preguntaSobreStock && preguntaSobreMayorCantidad) {
      const ordenados = [...juegos].sort(
        (a, b) => b.stock - a.stock
      );

      const mayorStock = ordenados[0].stock;
      const empatados = ordenados.filter(
        (juego) => juego.stock === mayorStock
      );

      const lista = ordenados
        .map(
          (juego, indice) =>
            `${indice + 1}. **${juego.nombre}** — ${juego.stock} unidades en stock (Plataforma: ${juego.plataforma}).`
        )
        .join("\n");

      const respuesta =
        `## Videojuegos con más unidades en stock\n\n` +
        (
          empatados.length === 1
            ? `El videojuego con más unidades es **${empatados[0].nombre}**, con **${mayorStock} unidades**.\n\n`
            : `Hay un empate en el mayor stock: **${empatados.map((j) => j.nombre).join(", ")}**, con **${mayorStock} unidades cada uno**.\n\n`
        ) +
        `### Inventario ordenado de mayor a menor\n\n${lista}`;

      return res.json({
        ok: true,
        respuesta,
      });
    }

    // Para otras preguntas, consultar Gemini.
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        ok: false,
        mensaje: "Falta configurar GEMINI_API_KEY en el servidor.",
      });
    }

    const { GoogleGenAI } = await import("@google/genai");

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const respuestaIA = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `
Eres el asistente inteligente de GAMERS CLOUD, un sistema de inventario de videojuegos.

Responde SIEMPRE en español y contesta directamente la pregunta del usuario.
Utiliza los datos reales proporcionados a continuación.
No inventes información, precios, videojuegos ni cantidades.
No respondas únicamente con un saludo o una introducción genérica.
Cuando preguntan por varios videojuegos, muestra sus nombres y los datos relevantes.
Cuando sea útil, presenta los resultados en listas o tablas Markdown.
Explica tus conclusiones con suficiente detalle y termina las ideas.
Si un dato no existe en el inventario, dilo claramente.

INVENTARIO ACTUAL:
${JSON.stringify(juegos, null, 2)}

PREGUNTA:
${pregunta}
`,
      config: {
        temperature: 0.2,
        maxOutputTokens: 1500,
      },
    });

    const respuesta = respuestaIA.text?.trim();

    if (!respuesta) {
      throw new Error("Gemini no devolvió una respuesta de texto.");
    }

    return res.json({
      ok: true,
      respuesta,
    });
  } catch (error) {
    console.error("Error en el asistente:", error);

    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo generar la respuesta. Revisa los registros del servidor.",
    });
  }
});

