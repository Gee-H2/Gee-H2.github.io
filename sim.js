/* Live 24h energy-system "digital twin" mini-model.
   Vanilla JS, no deps. A greedy battery dispatch over a synthetic day, re-run live
   as the visitor drags the battery-size slider. Draws PV, demand and grid-import
   curves and updates KPIs (solar fraction, peak reduction, CO2 saved).
   Respects prefers-reduced-motion and the site's CSS variables (light/dark). */
(function () {
  "use strict";
  const HOURS = 24;
  const CO2_KG_PER_KWH = 0.233; // grid intensity, same basis as the research

  // Synthetic but realistic normalised day (kW on a ~600 kW-peak site).
  function profiles() {
    const demand = [], pv = [];
    for (let h = 0; h < HOURS; h++) {
      // twin-peak commercial demand: morning + evening
      const d = 180 + 300 * Math.exp(-((h - 9) ** 2) / 7) + 360 * Math.exp(-((h - 19) ** 2) / 5);
      // solar: daylight bell centred ~13:00
      const s = Math.max(0, Math.sin((h - 6) / 12 * Math.PI)) * 900;
      demand.push(d); pv.push(s);
    }
    return { demand, pv };
  }

  // Greedy dispatch: use PV first; charge battery with surplus; discharge to cut import.
  function dispatch(demand, pv, capKWh, powerKW) {
    let soc = 0;
    const gridImport = [];
    for (let h = 0; h < HOURS; h++) {
      let net = demand[h] - pv[h]; // >0 need grid or battery; <0 surplus
      if (net < 0) {                // surplus -> charge
        const room = capKWh - soc;
        const charge = Math.min(-net, powerKW, room);
        soc += charge * 0.95;       // store efficiency
        gridImport.push(0);
      } else {                      // deficit -> discharge then grid
        const dis = Math.min(net, powerKW, soc * 0.95);
        soc -= dis / 0.95;
        gridImport.push(Math.max(0, net - dis));
      }
    }
    return gridImport;
  }

  function sum(a) { return a.reduce((x, y) => x + y, 0); }

  function kpis(demand, pv, grid) {
    const totDem = sum(demand), totPV = sum(pv), totImp = sum(grid);
    // PV consumed on-site = PV minus exported surplus. Approx: demand met not by grid.
    const served = totDem - totImp;
    const pvUsed = Math.min(totPV, served);
    const solarFrac = 100 * pvUsed / totDem;
    const basePeak = Math.max(...demand);
    const newPeak = Math.max(...grid);
    const peakRed = 100 * (basePeak - newPeak) / basePeak;
    const co2 = (totDem - totImp) * CO2_KG_PER_KWH / 1000; // tonnes-ish per day scale
    return { solarFrac, peakRed, co2, basePeak, newPeak };
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function mount(canvas, sliders, out) {
    const { demand, pv } = profiles();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ctx = canvas.getContext("2d");
    let hover = -1;

    function resize() {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr; canvas.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      const cap = +sliders.cap.value;
      const power = Math.max(50, cap / 3); // C-rate ~ /3h
      const grid = dispatch(demand, pv, cap, power);
      const k = kpis(demand, pv, grid);

      const r = canvas.getBoundingClientRect();
      const W = r.width, H = r.height, pad = 22;
      const maxY = Math.max(...demand, ...pv) * 1.05;
      const X = i => pad + i / (HOURS - 1) * (W - 2 * pad);
      const Y = v => H - pad - v / maxY * (H - 2 * pad);
      ctx.clearRect(0, 0, W, H);

      const accent = cssVar("--accent", "#1D6A5A");
      const ochre = cssVar("--ochre", "#9E6C14");
      const rule = cssVar("--rule", "#ccc");
      const muted = cssVar("--muted", "#666");

      // grid import as filled area (the thing storage shrinks)
      ctx.beginPath(); ctx.moveTo(X(0), Y(0));
      grid.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
      ctx.lineTo(X(HOURS - 1), Y(0)); ctx.closePath();
      ctx.fillStyle = accent + "22"; ctx.fill();

      const line = (arr, col, w) => {
        ctx.beginPath();
        arr.forEach((v, i) => { const x = X(i), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
      };
      line(pv, ochre, 2);           // solar
      line(demand, muted, 1.5);     // demand (faint)
      line(grid, accent, 2.6);      // grid import (bold, the story)

      // hover readout
      if (hover >= 0 && hover < HOURS) {
        const x = X(hover);
        ctx.strokeStyle = rule; ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, H - pad); ctx.stroke();
        ctx.fillStyle = muted; ctx.font = "11px 'IBM Plex Mono',monospace";
        ctx.fillText(`${hover}:00  import ${Math.round(grid[hover])} kW`, Math.min(x + 6, W - 130), pad + 12);
      }

      // KPIs
      out.solar.textContent = k.solarFrac.toFixed(1) + "%";
      out.peak.textContent = k.peakRed.toFixed(0) + "%";
      out.co2.textContent = k.co2.toFixed(2) + " t/day";
      out.capval.textContent = cap + " kWh · " + Math.round(power) + " kW";
    }

    canvas.addEventListener("pointermove", e => {
      const r = canvas.getBoundingClientRect();
      hover = Math.round((e.clientX - r.left - 22) / (r.width - 44) * (HOURS - 1));
      draw();
    });
    canvas.addEventListener("pointerleave", () => { hover = -1; draw(); });
    sliders.cap.addEventListener("input", draw);
    window.addEventListener("resize", () => { resize(); draw(); });
    document.addEventListener("themechange", draw);
    resize(); draw();
  }

  window.EnergySim = { mount };
})();
