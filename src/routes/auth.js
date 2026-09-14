const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("../db");
const { loginLimiter } = require("../middleware/auth");

const router = express.Router();

// ---------- Connexion ADMIN ----------

router.get("/admin/login", (req, res) => {
  if (req.session.adminId) return res.redirect("/admin");
  res.render("admin/login", { error: null });
});

router.post("/admin/login", loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const admin = db
    .prepare("SELECT * FROM admins WHERE username = ?")
    .get((username || "").trim().toLowerCase());

  if (!admin || !bcrypt.compareSync(password || "", admin.password_hash)) {
    return res.status(401).render("admin/login", {
      error: "Identifiant ou mot de passe incorrect.",
    });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).render("500");
    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;
    res.redirect("/admin");
  });
});

// ---------- Connexion JOUEUR ----------

router.get("/joueur/login", (req, res) => {
  if (req.session.playerId) return res.redirect("/joueur");
  res.render("joueur/login", { error: null });
});

router.post("/joueur/login", loginLimiter, (req, res) => {
  const { identifiant, code } = req.body;
  const player = db
    .prepare("SELECT * FROM players WHERE identifiant = ? AND actif = 1")
    .get((identifiant || "").trim().toLowerCase());

  if (!player || !bcrypt.compareSync(code || "", player.code_hash)) {
    return res.status(401).render("joueur/login", {
      error: "Identifiant ou code incorrect.",
    });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).render("500");
    req.session.playerId = player.id;
    res.redirect("/joueur");
  });
});

// ---------- Déconnexion (commune) ----------

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("ksmlabs.sid");
    res.redirect("/");
  });
});

module.exports = router;
