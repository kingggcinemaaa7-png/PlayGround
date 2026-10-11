// FAZ 0 oyun istemcisi: WS dinler, delta uygular. Köprü kapansa bile sahne
// "sabit ama yaşayan" yerel animasyonda kalır (Master Plan §9).
// Bağlantı koparsa üstel beklemeyle yeniden bağlanır, tam durumu alır.
(function () {
  const status = document.getElementById("status");
  const stage = document.getElementById("stage");
  const announceEl = document.getElementById("announce");
  const moonEl = document.getElementById("moon");
  const hypeEl = document.getElementById("hype");
  const top7El = document.getElementById("top7");
  const dropEl = document.getElementById("drop");

  const dancers = new Map(); // userId -> el
  let announceTimer = null;

  // --- minimal Three.js arka plan: gece + yıldız + 3 peri bacası silueti ---
  let renderer = null;
  try {
    const canvas = document.getElementById("c");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setSize(1080, 1920, false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060a1a);
    const cam = new THREE.PerspectiveCamera(60, 1080 / 1920, 0.1, 200);
    cam.position.set(0, 4, 26); cam.lookAt(0, 6, 0);
    // yıldızlar
    const starGeo = new THREE.BufferGeometry();
    const N = 900, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = Math.random() * 70 + 4;
      pos[i * 3 + 2] = -Math.random() * 80 - 10;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 0.35 }));
    scene.add(stars);
    // 3 peri bacası (konik kütle + emissive pencere noktaları) — FAZ 2'de gerçek modellere geçecek
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a1c33, roughness: 1 });
    const winMat = new THREE.MeshBasicMaterial({ color: 0xff9a2a });
    [[-9, 0, 14, 7], [0, 0, 17, 9], [9, 0, 12, 5]].forEach(([x, y, h, r]) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rockMat);
      cone.position.set(x, y + h / 2, -6);
      scene.add(cone);
      for (let wy = 2; wy < h; wy += 1.6) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), winMat);
        w.position.set(x + (Math.random() - 0.5) * r, y + wy, -6 + r * 0.55);
        scene.add(w);
      }
    });
    scene.add(new THREE.AmbientLight(0x334466, 1.2));
    const fire = new THREE.PointLight(0xff7722, 60, 60);
    fire.position.set(0, 1, 8); scene.add(fire);
    let t = 0;
    (function loop() {
      requestAnimationFrame(loop);
      t += 0.016;
      stars.rotation.y = t * 0.004;
      fire.intensity = 60 + Math.sin(t * 9) * 12; // alev kazanı titremesi
      try { renderer.render(scene, cam); } catch (e) { /* WebGL yoksa DOM yine yaşar */ }
    })();
  } catch (e) { status.textContent = "3B yok (2B mod): " + e.message; }

  function say(text) {
    announceEl.textContent = text;
    announceEl.style.opacity = 1;
    // TTS soyutlaması FAZ 0: tarayıcı sesi (opsiyonel, sessiz modda kapalı)
    try {
      if (window.speechSynthesis && !window.location.search.includes("mute=1")) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "tr-TR"; u.rate = 1.05;
        window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
      }
    } catch {}
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => (announceEl.style.opacity = 0), 4200);
    // müzik ducking FAZ 6'da; burada sadece log
  }

  function upsertDancer({ userId, name, lines, tier, front }) {
    let el = dancers.get(userId);
    if (!el) {
      el = document.createElement("div");
      el.className = "dancer" + (front ? " front" : "");
      stage.prepend(el);
      dancers.set(userId, el);
      while (stage.children.length > 12) {
        const last = stage.lastChild;
        for (const [k, v] of dancers) if (v === last) { dancers.delete(k); break; }
        last.remove();
      }
    }
    el.classList.toggle("front", !!front);
    el.innerHTML = "";
    const nm = document.createElement("div"); nm.className = "nm";
    nm.textContent = (lines || [name]).join("\n");
    const tr = document.createElement("div"); tr.className = "tr";
    tr.textContent = "T" + tier + " • " + name;
    el.append(nm, tr);
  }

  function onDelta(m) {
    const p = m.payload || {};
    if (m.kind === "announce") say(p.text);
    else if (m.kind === "dancer_add") upsertDancer(p);
    else if (m.kind === "participant_add") say(p.name + " vadiye katıldı!");
    else if (m.kind === "tier_up") { say(`${p.name}, ${p.tierName} oldu!`); upsertDancer({ userId: p.userId, name: p.name, lines: [p.name], tier: p.to, front: true }); }
    else if (m.kind === "moon") moonEl.textContent = "🌙 Ay: " + (p.name || "—");
    else if (m.kind === "hype") hypeEl.style.width = Math.min(100, p.hype / 10) + "%";
    else if (m.kind === "drop") { dropEl.style.opacity = 1; setTimeout(() => (dropEl.style.opacity = 0), 1200); say("DROP!"); }
    else if (m.kind === "leaderboard") top7El.innerHTML = "⭐ Büyükayı<br>" + p.top.map((r, i) => `${i + 1}. ${r.name} (${r.totalDiamonds})`).join("<br>");
    else if (m.kind === "toast") say(p.text);
    else if (m.kind === "window_lit") say(`${p.name} vadide bir pencere yaktı! (${p.count})`);
    else if (m.kind === "state_full") {
      if (p.moon) moonEl.textContent = "🌙 Ay: " + p.moon.name;
      if (p.leaderboard) top7El.innerHTML = "⭐ Büyükayı<br>" + p.leaderboard.slice(0, 7).map((r, i) => `${i + 1}. ${r.name}`).join("<br>");
    }
  }

  let backoff = 1000;
  function connect() {
    const ws = new WebSocket(`ws://${location.host}`);
    ws.onopen = () => { status.textContent = "canlı ✓"; backoff = 1000; };
    ws.onmessage = (e) => { try { onDelta(JSON.parse(e.data)); } catch {} };
    ws.onclose = () => {
      status.textContent = "bağlantı koptu — sahne yaşamaya devam ediyor, yeniden bağlanıyor…";
      setTimeout(connect, Math.min(backoff, 30000));
      backoff *= 2;
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  connect();
})();
