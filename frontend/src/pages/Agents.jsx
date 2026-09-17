import { useAuth } from "../context/AuthContext.jsx";
import UserManager from "../components/UserManager.jsx";

export default function Agents() {
  const { user } = useAuth();
  const base = user.role === "OWNER" ? "/owner" : "/admin";
  return (
    <UserManager
      title="Agents"
      listUrl="/staff/agents"
      createUrl={`${base}/agents`}
      deleteUrl={`${base}/agents`}
    />
  );
}