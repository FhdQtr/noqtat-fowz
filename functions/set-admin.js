const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const email = process.argv[2];
if (!email) {
  console.error("الاستخدام: npm run set-admin -- admin@example.com");
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
getAuth().getUserByEmail(email)
  .then((user) => getAuth().setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true }))
  .then(() => console.log(`تم منح صلاحية الإدارة للحساب: ${email}`))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
