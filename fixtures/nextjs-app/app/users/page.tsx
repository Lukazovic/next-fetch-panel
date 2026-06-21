import Link from "next/link";
import axios from "axios";

// adapter: "fetch" routes axios through globalThis.fetch, which is patched by instrumentation.ts.
const http = axios.create({ adapter: "fetch" });

type User = { id: number; name: string; email: string };

export default async function UsersPage() {
  const { data: users } = await http.get<User[]>(
    "https://jsonplaceholder.typicode.com/users"
  );

  return (
    <main>
      <Link href="/">← Back</Link>
      <h1>Users</h1>
      <ul>
        {users.map((user) => (
          <li key={user.id}>
            {user.name} — {user.email}
          </li>
        ))}
      </ul>
    </main>
  );
}
