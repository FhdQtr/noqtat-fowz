import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Link } from "react-router";
import { ShieldCheck, UserRound } from "lucide-react";
import { auth } from "../lib/firebase";

export default function AdminAccountLink() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => onAuthStateChanged(auth, (user) => {
    if (!user || user.isAnonymous) { setAdmin(false); return; }
    void user.getIdTokenResult().then((token) => setAdmin(token.claims.admin === true)).catch(() => setAdmin(false));
  }), []);
  return <Link to="/admin" className="btn-ghost-gold !px-3 !py-2 !text-sm flex items-center gap-2">
    {admin ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
    {admin ? "لوحة التحكم" : "دخول المدير"}
  </Link>;
}
