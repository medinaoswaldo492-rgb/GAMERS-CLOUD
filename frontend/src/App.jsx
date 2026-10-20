
import { useEffect, useMemo, useState } from "react";
import "./App.css";


const API_URL = "/api/videojuegos";
const CHAT_URL = "/api/chat";


const formularioInicial = {
  nombre: "",
  plataforma: "PC",
  genero: "Aventura",
  precio: "",
  stock: "",
};

function App() {
  const [sesion, setSesion] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [juegos, setJuegos] = useState([]);
  const [formulario, setFormulario] = useState(formularioInicial);
  const [editando, setEditando] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorAPI, setErrorAPI] = useState("");
  const [mensajeAPI, setMensajeAPI] = useState("");

  const [mensajesChat, setMensajesChat] = useState([]);
  const [entradaChat, setEntradaChat] = useState("");
  const [enviandoChat, setEnviandoChat] = useState(false);
  const [errorChat, setErrorChat] = useState("");

  // Cargar videojuegos desde Google Sheets a través de Node.js.
  async function cargarJuegos() {
    setCargando(true);
    setErrorAPI("");

    try {
      const respuesta = await fetch(API_URL);
      const resultado = await respuesta.json();

      if (!respuesta.ok || !resultado.ok) {
        throw new Error(
          resultado.mensaje || "No se pudieron cargar los videojuegos."
        );
      }

      const juegosAPI = resultado.datos.map((juego) => ({
        ...juego,
        id: String(juego.id),
        precio: Number(juego.precio),
        stock: Number(juego.stock),
      }));

      setJuegos(juegosAPI);
    } catch (error) {
      setErrorAPI(
        "No se pudo conectar con el servidor. Comprueba que Node.js esté ejecutándose. " +
          error.message
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarJuegos();
  }, []);

  const juegosFiltrados = useMemo(() => {
    return juegos.filter((juego) =>
      juego.nombre.toLowerCase().includes(busqueda.toLowerCase())
    );
  }, [juegos, busqueda]);

  function iniciarSesion(e) {
    e.preventDefault();

    if (usuario.trim() === "admin" && contrasena === "12345") {
      setSesion(true);
      setMensaje("");
      setContrasena("");
    } else {
      setMensaje("Usuario o contraseña incorrectos.");
    }
  }

  function cerrarSesion() {
    setSesion(false);
    setUsuario("");
    setContrasena("");
    cancelarEdicion();
    setMensajeAPI("");
  }

  function actualizarCampo(e) {
    const { name, value } = e.target;

    setFormulario((anterior) => ({
      ...anterior,
      [name]: value,
    }));
  }

  async function guardarJuego(e) {
    e.preventDefault();
    setMensajeAPI("");

    if (
      !formulario.nombre.trim() ||
      !formulario.plataforma ||
      !formulario.genero ||
      formulario.precio === "" ||
      formulario.stock === "" ||
      !Number.isFinite(Number(formulario.precio)) ||
      Number(formulario.precio) < 0 ||
      !Number.isInteger(Number(formulario.stock)) ||
      Number(formulario.stock) < 0
    ) {
      setMensajeAPI("Completa todos los campos con valores válidos.");
      return;
    }

    const datos = {
      nombre: formulario.nombre.trim(),
      plataforma: formulario.plataforma,
      genero: formulario.genero,
      precio: Number(formulario.precio),
      stock: Number(formulario.stock),
    };

    setGuardando(true);

    try {
      const esEdicion = editando !== null;

      const respuesta = await fetch(
        esEdicion ? `${API_URL}/${encodeURIComponent(editando)}` : API_URL,
        {
          method: esEdicion ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(datos),
        }
      );

      const resultado = await respuesta.json();

      if (!respuesta.ok || !resultado.ok) {
        throw new Error(
          resultado.mensaje || "No se pudo guardar el videojuego."
        );
      }

      // Consultar nuevamente los datos guardados en la hoja.
      await cargarJuegos();

      setMensajeAPI(
        esEdicion
          ? "Videojuego actualizado correctamente."
          : "Videojuego agregado correctamente."
      );

      cancelarEdicion();
    } catch (error) {
      setMensajeAPI(`Error al guardar: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  }

  function editarJuego(juego) {
    setEditando(juego.id);
    setMensajeAPI("");

    setFormulario({
      nombre: juego.nombre,
      plataforma: juego.plataforma,
      genero: juego.genero,
      precio: String(juego.precio),
      stock: String(juego.stock),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function eliminarJuego(id) {
    const confirmado = window.confirm(
      "¿Deseas eliminar este videojuego? Esta acción también lo eliminará de Google Sheets."
    );

    if (!confirmado) return;

    setMensajeAPI("");

    try {
      const respuesta = await fetch(
        `${API_URL}/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );

      const resultado = await respuesta.json();

      if (!respuesta.ok || !resultado.ok) {
        throw new Error(
          resultado.mensaje || "No se pudo eliminar el videojuego."
        );
      }

      await cargarJuegos();

      if (editando === id) {
        cancelarEdicion();
      }

      setMensajeAPI("Videojuego eliminado correctamente.");
    } catch (error) {
      setMensajeAPI(`Error al eliminar: ${error.message}`);
    }
  }

  function cancelarEdicion() {
    setEditando(null);
    setFormulario(formularioInicial);
  }

  
async function enviarMensaje(e) {
  e.preventDefault();

  const pregunta = entradaChat.trim();

  if (!pregunta || enviandoChat) return;

  const historial = mensajesChat.map(({ role, content }) => ({
    role,
    content,
  }));

  setMensajesChat((anteriores) => [
    ...anteriores,
    { role: "user", content: pregunta },
  ]);

  setEntradaChat("");
  setEnviandoChat(true);
  setErrorChat("");

  try {
    const respuesta = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pregunta,
        historial,
      }),
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok || !resultado.ok) {
      throw new Error(
        resultado.mensaje || "No se pudo obtener una respuesta."
      );
    }

    setMensajesChat((anteriores) => [
      ...anteriores,
      {
        role: "assistant",
        content: resultado.respuesta,
      },
    ]);
  } catch (error) {
    setErrorChat(error.message);
  } finally {
    setEnviandoChat(false);
  }
}

function nuevoChat() {
  if (enviandoChat) return;

  setMensajesChat([]);
  setEntradaChat("");
  setErrorChat("");
}


  if (!sesion) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="brand-icon">🎮</div>

          <p className="eyebrow">TU COLECCIÓN, TU MUNDO</p>
          <h1>
            GAMERS <span>CLOUD</span>
          </h1>

          <p className="login-description">
            Inicia sesión para administrar tu catálogo de videojuegos.
          </p>

          <form onSubmit={iniciarSesion} className="login-form">
            <label htmlFor="usuario">Usuario</label>
            <input
              id="usuario"
              autoComplete="username"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="Ingresa tu usuario"
              required
            />

            <label htmlFor="contrasena">Contraseña</label>
            <input
              id="contrasena"
              type="password"
              autoComplete="current-password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              placeholder="Ingresa tu contraseña"
              required
            />

            {mensaje && <p className="error-message">{mensaje}</p>}

            <button className="primary-button login-button" type="submit">
              INICIAR SESIÓN <span>→</span>
            </button>
          </form>

          <p className="demo-hint">Acceso de prueba: admin / 12345</p>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <a className="brand" href="#inicio">
          <span className="brand-symbol">🎮</span>
          GAMERS <span>CLOUD</span>
        </a>

        <div className="user-area">
          <span className="online-dot" />
          <span>{usuario}</span>
          <button className="logout-button" onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <section className="hero" id="inicio">
        <div>
          <p className="eyebrow">PANEL DE ADMINISTRACIÓN</p>
          <h1>
            Tu universo <span>gamer.</span>
          </h1>
          <p>
            Administra tu inventario de videojuegos desde un solo lugar.
          </p>
        </div>

        <div className="hero-icon">🕹️</div>
      </section>

      {errorAPI && (
        <section className="panel" role="alert">
          <p className="error-message">{errorAPI}</p>
          <button
            className="secondary-button"
            onClick={cargarJuegos}
            disabled={cargando}
          >
            {cargando ? "Cargando..." : "Reintentar conexión"}
          </button>
        </section>
      )}

      {mensajeAPI && (
        <p role="status" aria-live="polite">
          {mensajeAPI}
        </p>
      )}

      <section className="stats-grid">
        <article className="stat-card">
          <span className="stat-icon purple">🎮</span>
          <div>
            <p>Videojuegos registrados</p>
            <strong>{juegos.length}</strong>
          </div>
        </article>

        <article className="stat-card">
          <span className="stat-icon blue">📦</span>
          <div>
            <p>Unidades disponibles</p>
            <strong>
              {juegos.reduce((total, juego) => total + juego.stock, 0)}
            </strong>
          </div>
        </article>

        <article className="stat-card">
          <span className="stat-icon green">💰</span>
          <div>
            <p>Valor del inventario</p>
            <strong>
              {juegos
                .reduce(
                  (total, juego) => total + juego.precio * juego.stock,
                  0
                )
                .toLocaleString("es-MX", {
                  style: "currency",
                  currency: "MXN",
                  maximumFractionDigits: 2,
                })}
            </strong>
          </div>
        </article>
      </section>

      
<section className="chat-panel">
  <div className="chat-header">
    <div className="chat-brand">
      <div className="chat-logo">✦</div>
      <div>
        <p className="eyebrow">INTELIGENCIA ARTIFICIAL</p>
        <h2>GAMERS <span>AI</span></h2>
        <p className="chat-status">
          <span className="online-dot" />
          Asistente conectado a tu catálogo
        </p>
      </div>
    </div>

    <button
      type="button"
      className="chat-new-button"
      onClick={nuevoChat}
      disabled={enviandoChat}
    >
      + Nuevo chat
    </button>
  </div>

  <div
    className="chat-messages"
    aria-live="polite"
    aria-label="Conversación con GAMERS AI"
  >
    {mensajesChat.length === 0 && (
      <div className="chat-welcome">
        <div className="chat-welcome-icon">🎮</div>
        <h3>¡Hola, gamer!</h3>
        <p>
          Soy GAMERS AI. Puedo ayudarte a consultar tu inventario,
          conocer los precios y encontrar videojuegos por género
          o plataforma.
        </p>

        <div className="chat-suggestions">
          <button
            type="button"
            onClick={() =>
              setEntradaChat("¿Qué videojuegos tenemos disponibles?")
            }
          >
            🎮 Ver videojuegos
          </button>

          <button
            type="button"
            onClick={() =>
              setEntradaChat("¿Cuáles son los juegos de aventura?")
            }
          >
            🗺️ Juegos de aventura
          </button>

          <button
            type="button"
            onClick={() =>
              setEntradaChat("¿Cuál es el valor total del inventario?")
            }
          >
            💰 Valor del inventario
          </button>
        </div>
      </div>
    )}

    {mensajesChat.map((mensaje, indice) => (
      <div
        key={`${indice}-${mensaje.role}`}
        className={`chat-message ${
          mensaje.role === "user" ? "user-message" : "ai-message"
        }`}
      >
        {mensaje.role === "assistant" && (
          <div className="message-avatar">✦</div>
        )}

        <div className="message-bubble">
          <span className="message-author">
            {mensaje.role === "user" ? "Tú" : "GAMERS AI"}
          </span>
          <p>{mensaje.content}</p>
        </div>

        {mensaje.role === "user" && (
          <div className="message-avatar user-avatar">T</div>
        )}
      </div>
    ))}

    {enviandoChat && (
      <div className="chat-message ai-message">
        <div className="message-avatar">✦</div>
        <div className="message-bubble typing-bubble">
          <span className="message-author">GAMERS AI</span>
          <p>Preparando respuesta...</p>
          <div className="typing-dots">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    )}

    {errorChat && (
      <div className="chat-error" role="alert">
        <p>{errorChat}</p>
        <button
          type="button"
          onClick={() => setEntradaChat(
            "Ayúdame a consultar el inventario de videojuegos."
          )}
        >
          Intentar otra pregunta
        </button>
      </div>
    )}
  </div>

  <form className="chat-input-area" onSubmit={enviarMensaje}>
    <input
      aria-label="Escribe tu mensaje"
      value={entradaChat}
      onChange={(e) => setEntradaChat(e.target.value)}
      placeholder="Pregúntame sobre tus videojuegos..."
      maxLength={1000}
      disabled={enviandoChat}
    />

    <button
      type="submit"
      className="chat-send-button"
      disabled={enviandoChat || !entradaChat.trim()}
      aria-label="Enviar mensaje"
      title="Enviar mensaje"
    >
      ➤
    </button>
  </form>

  <p className="chat-disclaimer">
    GAMERS AI puede cometer errores. Verifica los datos importantes.
  </p>
</section>


      <section className="content-grid">
        <article className="panel form-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">INVENTARIO</p>
              <h2>
                {editando !== null ? "Editar juego" : "Nuevo videojuego"}
              </h2>
            </div>
            <span className="heading-icon">✦</span>
          </div>

          <form onSubmit={guardarJuego} className="game-form">
            <label htmlFor="nombre">Nombre del videojuego</label>
            <input
              id="nombre"
              name="nombre"
              value={formulario.nombre}
              onChange={actualizarCampo}
              placeholder="Ej. God of War"
              maxLength={100}
              required
            />

            <label htmlFor="plataforma">Plataforma</label>
            <select
              id="plataforma"
              name="plataforma"
              value={formulario.plataforma}
              onChange={actualizarCampo}
              required
            >
              <option>PC</option>
              <option>PlayStation 5</option>
              <option>PlayStation 4</option>
              <option>Xbox Series X/S</option>
              <option>Xbox One</option>
              <option>Nintendo Switch</option>
            </select>

            <label htmlFor="genero">Género</label>
            <select
              id="genero"
              name="genero"
              value={formulario.genero}
              onChange={actualizarCampo}
              required
            >
              <option>Aventura</option>
              <option>Acción</option>
              <option>Deportes</option>
              <option>RPG</option>
              <option>Terror</option>
              <option>Estrategia</option>
              <option>Carreras</option>
              <option>Simulación</option>
            </select>

            <div className="field-row">
              <div>
                <label htmlFor="precio">Precio (MXN)</label>
                <input
                  id="precio"
                  name="precio"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formulario.precio}
                  onChange={actualizarCampo}
                  placeholder="599"
                  required
                />
              </div>

              <div>
                <label htmlFor="stock">Stock</label>
                <input
                  id="stock"
                  name="stock"
                  type="number"
                  min="0"
                  step="1"
                  value={formulario.stock}
                  onChange={actualizarCampo}
                  placeholder="10"
                  required
                />
              </div>
            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={guardando}
            >
              {guardando
                ? "GUARDANDO..."
                : editando !== null
                  ? "GUARDAR CAMBIOS"
                  : "+ AGREGAR JUEGO"}
            </button>

            {editando !== null && (
              <button
                className="secondary-button"
                type="button"
                onClick={cancelarEdicion}
                disabled={guardando}
              >
                Cancelar edición
              </button>
            )}
          </form>
        </article>

        <article className="panel inventory-panel">
          <div className="panel-heading inventory-heading">
            <div>
              <p className="eyebrow">TU COLECCIÓN</p>
              <h2>Videojuegos</h2>
            </div>

            <span className="count-badge">
              {juegosFiltrados.length} juegos
            </span>
          </div>

          <div className="search-box">
            <span>⌕</span>
            <input
              aria-label="Buscar videojuego"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre..."
            />
          </div>

          {cargando ? (
            <p role="status">Cargando videojuegos desde Google Sheets...</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>VIDEOJUEGO</th>
                    <th>PLATAFORMA</th>
                    <th>PRECIO</th>
                    <th>STOCK</th>
                    <th>ACCIONES</th>
                  </tr>
                </thead>

                <tbody>
                  {juegosFiltrados.map((juego) => (
                    <tr key={juego.id}>
                      <td>
                        <div className="game-name">
                          <span className="game-avatar">🎮</span>
                          <div>
                            <strong>{juego.nombre}</strong>
                            <small>{juego.genero}</small>
                          </div>
                        </div>
                      </td>

                      <td>{juego.plataforma}</td>

                      <td>
                        {juego.precio.toLocaleString("es-MX", {
                          style: "currency",
                          currency: "MXN",
                        })}
                      </td>

                      <td>
                        <span className="stock-badge">{juego.stock}</span>
                      </td>

                      <td>
                        <div className="actions">
                          <button
                            className="edit-button"
                            onClick={() => editarJuego(juego)}
                            aria-label={`Editar ${juego.nombre}`}
                            title="Editar"
                          >
                            ✎
                          </button>

                          <button
                            className="delete-button"
                            onClick={() => eliminarJuego(juego.id)}
                            aria-label={`Eliminar ${juego.nombre}`}
                            title="Eliminar"
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {juegosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan="5" className="empty-state">
                        {busqueda
                          ? "No se encontraron videojuegos."
                          : "No hay videojuegos registrados."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p className="table-note">
            Inventario conectado a la API de GAMERS CLOUD y Google Sheets.
          </p>
        </article>
      </section>

      <footer className="footer">
        GAMERS CLOUD <span>·</span> Sistema de inventario de videojuegos
      </footer>
    </main>
  );
}

export default App;
