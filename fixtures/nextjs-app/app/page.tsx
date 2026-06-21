import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>next-fetch-panel fixture</h1>
      <nav>
        <Link href="/posts">Posts</Link>
        {" | "}
        <Link href="/users">Users</Link>
      </nav>
    </main>
  );
}
