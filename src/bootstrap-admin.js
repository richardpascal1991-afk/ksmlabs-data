// Au démarrage du serveur : s'il n'existe aucun compte administrateur,
// on en crée un automatiquement à partir des variables d'environnement
// ADMIN_USERNAME / ADMIN_PASSWORD (pratique pour un premier déploiement
// sur Railway/Render sans avoir à ouvrir un terminal).
//
// Cette création automatique ne se produit QUE s'il n'existe encore
// aucun admin — elle ne réinitialise jamais un mot de passe existant.

const bcrypt = require("bcryptjs");
const { db } = require("./db");

function bootstrapAdmin() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM admins").get().n;
  if (count > 0) return;

  const username = (process.env.ADMIN_USERNAME || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!username || !password) {
    console.warn(
      "[KSMLABS] Aucun compte administrateur n'existe encore.\n" +
        "  -> Définis ADMIN_USERNAME et ADMIN_PASSWORD dans les variables d'environnement puis redémarre,\n" +
        "     ou lance localement : npm run seed:admin"
    );
    return;
  }
  if (password.length < 8) {
    console.warn("[KSMLABS] ADMIN_PASSWORD doit faire au moins 8 caractères — compte non créé.");
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(username, hash);
  console.log(`[KSMLABS] Compte administrateur "${username}" créé automatiquement au démarrage.`);
}

module.exports = { bootstrapAdmin };
