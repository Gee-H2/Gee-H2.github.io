/* Live GB grid carbon-intensity widget using the free Carbon Intensity API
   (https://api.carbonintensity.org.uk). No key required, CORS-enabled.
   Fails gracefully offline. */
(function () {
  "use strict";
  const API = "https://api.carbonintensity.org.uk/intensity";
  const bands = [
    { max: 50, label: "very low", col: "#1D6A5A" },
    { max: 120, label: "low", col: "#3E9E7A" },
    { max: 200, label: "moderate", col: "#C99A45" },
    { max: 300, label: "high", col: "#C4622D" },
    { max: 1e9, label: "very high", col: "#A83E2B" },
  ];
  function band(v) { return bands.find(b => v <= b.max); }

  function draw(canvas, value) {
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * dpr; canvas.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height, cx = W / 2, cy = H * 0.92, rad = Math.min(W / 2, H) * 0.82;
    const b = band(value), frac = Math.min(1, value / 400);
    // track
    ctx.lineWidth = 12; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(cx, cy, rad, Math.PI, 2 * Math.PI); ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--rule").trim() || "#ccc"; ctx.stroke();
    // value arc
    ctx.beginPath(); ctx.arc(cx, cy, rad, Math.PI, Math.PI + frac * Math.PI); ctx.strokeStyle = b.col; ctx.stroke();
    // text
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#000";
    ctx.textAlign = "center"; ctx.font = "600 30px 'Newsreader',serif";
    ctx.fillText(Math.round(value), cx, cy - 6);
    ctx.font = "11px 'IBM Plex Mono',monospace"; ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#666";
    ctx.fillText("gCO₂/kWh", cx, cy + 12);
  }

  function mount(canvas, statusEl) {
    let last = null;
    function render() { if (last != null) draw(canvas, last); }
    document.addEventListener("themechange", render);
    window.addEventListener("resize", render);
    fetch(API, { headers: { Accept: "application/json" } })
      .then(r => r.json())
      .then(d => {
        const row = d && d.data && d.data[0] && d.data[0].intensity;
        const v = row && (row.actual != null ? row.actual : row.forecast);
        if (v == null) throw new Error("no value");
        last = v; render();
        const b = band(v);
        statusEl.innerHTML = `GB grid right now — <b style="color:${b.col}">${b.label}</b> carbon. Live from the Carbon Intensity API.`;
      })
      .catch(() => {
        canvas.style.display = "none";
        statusEl.textContent = "Live grid carbon-intensity is unavailable right now (offline or API unreachable).";
      });
  }
  window.GridWidget = { mount };
})();
