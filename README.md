# Retro "El Camino de los Colonos" (tiempo real)

Sin dependencias. Requiere Node 18 o superior.

```bash
node server.js          # http://localhost:3000  (PORT=8080 node server.js para otro puerto)
```

## Uso
1. El facilitador abre la URL, escribe su nombre y pulsa **Crear sala**. Obtiene un código de 4 letras.
2. En la fase **Llegada**, pulsa **Copiar enlace para el equipo** y lo comparte por el chat.
3. Cada persona entra con su nombre de colono. Todo se actualiza en vivo en todas las pantallas.
4. Solo el facilitador cambia de fase, lanza los dados, inicia timers y reinicia. El resto agrega notas, vota, propone acciones y puntúa el ROTI.

## Reglas que aplica el servidor
- 3 puntos por persona en cada votación (notas, Ladrón y propuestas).
- Las notas del Ladrón no guardan autor.
- Cada persona borra solo sus notas; el facilitador borra cualquiera.
- Los dados se tiran en el servidor, así que todos ven el mismo resultado.
- Con un 7 pasa a la fase del Ladrón con un timer de 5 min; con otro recurso se abre un timer de 2 min.

## Publicarlo para que el equipo entre
El servidor necesita una URL pública. Opciones:
- **Prueba rápida desde tu PC:** `node server.js` y, en otra terminal, `cloudflared tunnel --url http://localhost:3000` o `ngrok http 3000`.
- **Hosting:** Render, Railway, Fly.io o cualquier servidor con Node. Comando de arranque: `node server.js`. Debe respetar la variable `PORT`.

## Limitaciones
- El estado vive en memoria. Si el servidor se reinicia se pierden las salas, así que exporta el acta (⬇ Acta) al terminar.
- Las salas inactivas se borran tras 6 h.
- `offline.html` es la versión sin servidor (un solo navegador compartiendo pantalla).
