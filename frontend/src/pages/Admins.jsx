import UserManager from "../components/UserManager.jsx";

export default function Admins() {
  return (
    <UserManager
      title="Admins"
      listUrl="/owner/admins"
      createUrl="/owner/admins"
      deleteUrl="/owner/admins"
    />
  );
}