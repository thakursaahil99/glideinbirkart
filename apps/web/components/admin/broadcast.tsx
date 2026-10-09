'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Send, Smartphone, Users } from 'lucide-react';
import { toast } from 'sonner';
import { broadcastSchema, type BroadcastOutput } from '@gk/validators';
import { api } from '@/lib/api';
import { errMsg, useZodForm } from '@/lib/forms';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui/data';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/overlay';
import { PageHeader, StatCard } from '@/components/dashboard/common';

/** Send an offer or announcement to everyone's in-app inbox and, where installed, as a phone push. */
export function BroadcastAdmin() {
  const audience = useQuery({
    queryKey: ['admin-broadcast-audience'],
    queryFn: () => api.admin.notifications.audience(),
  });
  const form = useZodForm(broadcastSchema, {
    defaultValues: { title: '', body: '', audience: 'CUSTOMERS', productSlug: '' },
  });
  const [confirm, setConfirm] = useState<BroadcastOutput | null>(null);
  const [sending, setSending] = useState(false);
  const e = form.formState.errors;
  const watched = form.watch();
  const reach = watched.audience === 'ALL' ? audience.data?.allUsers : audience.data?.customers;

  const send = async () => {
    if (!confirm) return;
    setSending(true);
    try {
      const res = await api.admin.notifications.broadcast({
        ...confirm,
        title: confirm.title,
        body: confirm.body,
        audience: confirm.audience ?? 'CUSTOMERS',
        productSlug: confirm.productSlug || undefined,
      });
      toast.success(`Sent to ${res.recipients} users (${res.pushUsers} phones get a push)`);
      form.reset({ title: '', body: '', audience: confirm.audience, productSlug: '' });
      setConfirm(null);
    } catch (err) {
      toast.error(errMsg(err, 'Could not send the notification'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader
        title="App notifications"
        description="Send an offer or announcement. It lands in every user's notification inbox on the website and the app, and as a push on phones that have the app installed."
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {audience.isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <StatCard
              label="Customers"
              value={String(audience.data?.customers ?? 0)}
              icon={Users}
            />
            <StatCard
              label="All active users"
              value={String(audience.data?.allUsers ?? 0)}
              icon={BellRing}
            />
            <StatCard
              label="Phones with the app"
              value={String(audience.data?.pushDevices ?? 0)}
              icon={Smartphone}
            />
          </>
        )}
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>New notification</CardTitle>
          <CardDescription>
            Keep it short: the title is bold on the phone lock screen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="grid gap-4"
            onSubmit={form.handleSubmit((v) => setConfirm(v))}
          >
            <Field label="Title" htmlFor="bt" error={e.title?.message} hint="Up to 70 characters">
              <Input
                id="bt"
                maxLength={70}
                placeholder="Weekend sale: up to 60% off"
                {...form.register('title')}
              />
            </Field>
            <Field label="Message" htmlFor="bb" error={e.body?.message} hint="Up to 240 characters">
              <Textarea
                id="bb"
                rows={3}
                maxLength={240}
                placeholder="Use code FESTIVE20 for an extra 20% off on orders above ₹1,999."
                {...form.register('body')}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Send to" htmlFor="ba">
                <Select id="ba" {...form.register('audience')}>
                  <option value="CUSTOMERS">Customers only</option>
                  <option value="ALL">Everyone (incl. sellers and admins)</option>
                </Select>
              </Field>
              <Field
                label="Open product (optional)"
                htmlFor="bp"
                error={e.productSlug?.message}
                hint="Product slug, e.g. voltix-basswave-wired-headphones"
              >
                <Input id="bp" {...form.register('productSlug')} />
              </Field>
            </div>
            <div>
              <Button type="submit">
                <Send /> Review and send
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && !sending && setConfirm(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Send to {reach ?? '…'} users?</DialogTitle>
            <DialogDescription>This cannot be recalled once it is sent.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border bg-muted/50 p-3 text-sm">
            <p className="font-bold">{confirm?.title}</p>
            <p className="text-muted-foreground">{confirm?.body}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={send} loading={sending}>
              <Send /> Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
