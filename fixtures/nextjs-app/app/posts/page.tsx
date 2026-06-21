import Link from "next/link";

// Simulates a secret coming from env — the panel redacts this from the URL.
const POSTS_API_KEY = process.env.POSTS_API_KEY ?? "super-secret-key-abc123";

type Post = { id: number; title: string };

export default async function PostsPage() {
  const res = await fetch(
    `https://jsonplaceholder.typicode.com/posts?api_key=${POSTS_API_KEY}`
  );
  const posts: Post[] = await res.json();

  return (
    <main>
      <Link href="/">← Back</Link>
      <h1>Posts</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </main>
  );
}
