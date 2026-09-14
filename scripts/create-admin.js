// Crée (ou met à jour le mot de passe d') un compte administrateur.
// Usage interactif :   npm run seed:admin
// Usage non-interactif (utile en déploiement automatisé) :
//   ADMIN_USERNAME=agence ADMIN_PASSWORD=motdepasse node scripts/create-admin.js
//
// Note : en mode interactif, le mot de passe tapé reste visible dans le
// terminal (pas de masquage) — lance cette commande dans un endroit privé.

require("dotenv").config();
const readline = require("readline");
const bcrypt = require("bcryptjs");
const { db } = require("../src/db");

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

async function main() {
  let username = process.env.ADMIN_USERNAME;
  let password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log("Création du compte administrateur KSMLABS\n");
    if (!username) username = await ask(rl, "Identifiant admin : ");
    if (!password) password = await ask(rl, "Mot de passe (min 8 caracteres) : ");
    rl.close();
  }

  username = (username || "").trim().toLowerCase();
  if (!username) {
    console.error("Identifiant manquant.");
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error("Le mot de passe doit faire au moins 8 caracteres.");
    process.exit(1);
  }

  const hash = bcrypt.hashSync(password, 10);
  const existing = db.prepare("SELECT * FROM admins WHERE username = ?").get(username);

  if (existing) {
    db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(hash, existing.id);
    console.log(`Mot de passe mis a jour pour l'administrateur "${username}".`);
  } else {
    db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(username, hash);
    console.log(`Compte administrateur "${username}" cree.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
