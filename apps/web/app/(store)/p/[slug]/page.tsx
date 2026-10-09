import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { revalidate as rv, safe, serverApi } from '@/lib/server-api';
import { formatDate } from '@/lib/utils';

export const revalidate = 600;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await safe(() => serverApi.cms.page(slug, rv.long));
  return page
    ? { title: page.title, alternates: { canonical: `/p/${slug}` } }
    : { title: 'Page not found' };
}

/** CMS pages (About, Privacy, Terms...). Markdown is rendered without raw HTML, so editors cannot inject scripts. */
export default async function CmsPage({ params }: Props) {
  const { slug } = await params;
  const page = await safe(() => serverApi.cms.page(slug, rv.long));
  if (!page) notFound();
  return (
    <div className="container-page py-8 sm:py-12">
      <article className="mx-auto max-w-3xl rounded-3xl border bg-card p-6 shadow-soft sm:p-10">
        <div className="prose-gk">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{page.content}</ReactMarkdown>
        </div>
        <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          Last updated {formatDate(page.updatedAt)}
        </p>
      </article>
    </div>
  );
}
