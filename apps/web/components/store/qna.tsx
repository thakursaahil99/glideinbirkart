'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleHelp, Store } from 'lucide-react';
import { toast } from 'sonner';
import type { QuestionDto } from '@gk/types';
import { api, hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { errMsg } from '@/lib/forms';
import { formatDate } from '@/lib/utils';
import { Badge, EmptyState, Skeleton } from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';

function AnswerForm({ questionId, onDone }: { questionId: string; onDone: () => void }) {
  const [text, setText] = useState('');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.qna.answer(questionId, text),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['questions'] });
      setText('');
      onDone();
      toast.success('Answer posted');
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim().length >= 2) m.mutate();
      }}
    >
      <Input
        aria-label="Your answer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Share what you know…"
        maxLength={1000}
        className="h-10"
      />
      <Button
        type="submit"
        size="sm"
        className="h-10"
        loading={m.isPending}
        disabled={text.trim().length < 2}
      >
        Post
      </Button>
    </form>
  );
}

function QuestionItem({ q, authed }: { q: QuestionDto; authed: boolean }) {
  const [answering, setAnswering] = useState(false);
  return (
    <li className="space-y-2.5 border-b py-4 last:border-0">
      <p className="flex gap-2 text-sm font-semibold">
        <span className="grid size-5 shrink-0 place-content-center rounded bg-primary text-[11px] font-extrabold text-primary-foreground">
          Q
        </span>
        {q.body}
      </p>
      <p className="pl-7 text-xs text-muted-foreground">
        Asked by {q.user.name} on {formatDate(q.createdAt)}
      </p>
      {q.answers.map((a) => (
        <div key={a.id} className="ml-7 rounded-xl bg-muted/70 p-3 text-sm">
          <p className="flex gap-2">
            <span className="grid size-5 shrink-0 place-content-center rounded bg-success text-[11px] font-extrabold text-success-foreground">
              A
            </span>
            {a.body}
          </p>
          <p className="mt-1.5 flex items-center gap-2 pl-7 text-xs text-muted-foreground">
            {a.isSeller ? (
              <Badge variant="default" className="gap-1 normal-case">
                <Store className="size-3" /> Seller
              </Badge>
            ) : (
              a.user.name
            )}{' '}
            · {formatDate(a.createdAt)}
          </p>
        </div>
      ))}
      {authed &&
        (answering ? (
          <div className="pl-7">
            <AnswerForm questionId={q.id} onDone={() => setAnswering(false)} />
          </div>
        ) : (
          <button
            type="button"
            className="pl-7 text-xs font-semibold text-primary hover:underline"
            onClick={() => setAnswering(true)}
          >
            Answer this question
          </button>
        ))}
    </li>
  );
}

export function QnaSection({ productId }: { productId: string }) {
  const status = useAuth((s) => s.status);
  const pathname = usePathname();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const { data, isLoading } = hooks.useQuestions(productId, { page, limit: 5 });
  const ask = useMutation({
    mutationFn: () => api.qna.ask(productId, text),
    onSuccess: () => {
      setText('');
      void qc.invalidateQueries({ queryKey: ['questions'] });
      toast.success('Question posted — the seller has been notified');
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <section id="questions" aria-labelledby="qna-h" className="scroll-mt-32">
      <h2 id="qna-h" className="section-title mb-5">
        Questions & answers
      </h2>
      {status === 'authed' ? (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim().length >= 5) ask.mutate();
          }}
        >
          <Input
            aria-label="Ask a question"
            placeholder="Have a question? Ask the seller and other customers"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
          />
          <Button type="submit" loading={ask.isPending} disabled={text.trim().length < 5}>
            Ask
          </Button>
        </form>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">
          <Link
            href={`/login?next=${encodeURIComponent(pathname)}`}
            className="font-semibold text-primary hover:underline"
          >
            Sign in
          </Link>{' '}
          to ask a question.
        </p>
      )}
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : data && data.items.length > 0 ? (
        <>
          <ul>
            {data.items.map((q) => (
              <QuestionItem key={q.id} q={q} authed={status === 'authed'} />
            ))}
          </ul>
          {data.meta.totalPages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {data.meta.page} of {data.meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.meta.hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<CircleHelp />}
          title="No questions yet"
          description="Be the first to ask about this product."
        />
      )}
    </section>
  );
}
