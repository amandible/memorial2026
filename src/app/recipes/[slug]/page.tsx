import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecipe, getRecipes } from "@/lib/recipes";

// All 71 are known at build time, so every recipe is a static page.
export function generateStaticParams() {
  return getRecipes().map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const recipe = getRecipe(slug);
  if (!recipe) return { title: "Recipe not found" };
  return {
    title: recipe.title,
    description: `${recipe.title} — from Joe Weisman's recipe files (${recipe.file}).`,
  };
}

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const recipe = getRecipe(slug);
  if (!recipe) notFound();

  const all = getRecipes();
  const i = all.findIndex((r) => r.slug === recipe.slug);
  const prev = all[i - 1];
  const next = all[i + 1];

  return (
    <main className="page page-recipe" id="main">
      <p className="crumb">
        <Link href="/recipes">&larr; All recipes</Link>
      </p>

      <h1 className="recipe-title">{recipe.title}</h1>
      <p className="recipe-file">from: {recipe.file}</p>
      <hr className="rule" />

      {/* Rendered as text by React, never as HTML. pre-wrap keeps his line
          breaks and spacing while letting the few very long lines wrap instead
          of forcing the page sideways. */}
      <pre className="recipe-body">{recipe.body}</pre>

      <nav className="pager" aria-label="Other recipes">
        {prev ? (
          <Link href={`/recipes/${prev.slug}`} className="pager-prev">
            &larr; {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/recipes/${next.slug}`} className="pager-next">
            {next.title} &rarr;
          </Link>
        )}
      </nav>
    </main>
  );
}
