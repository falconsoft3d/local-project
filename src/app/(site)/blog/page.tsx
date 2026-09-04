import Link from "next/link";
import { getAllPosts } from "@/lib/blog";

export const metadata = {
  title: "Blog — LoocalProject",
};

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Blog</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Novedades y guías sobre LoocalProject.
      </p>

      {posts.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 py-20 text-center text-neutral-400">
          Aún no hay artículos.
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="flex flex-col rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <h2 className="text-base font-semibold text-neutral-900">{post.title}</h2>
              {post.date && (
                <p className="mt-1 text-xs text-neutral-400">
                  {new Date(post.date).toLocaleDateString("es-ES", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
              <p className="mt-2 text-sm text-neutral-600">{post.excerpt}</p>
              <span className="mt-3 text-sm font-medium text-green-700">Leer más →</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
