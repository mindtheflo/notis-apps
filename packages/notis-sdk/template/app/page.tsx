'use client';

import { useNotis, useDatabase } from '@notis/sdk';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  const { app, ready } = useNotis();
  const { documents, loading } = useDatabase('items');

  return (
    <main className="notis-app-shell space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <Badge variant="secondary" className="w-fit">Installed app</Badge>
          <div className="space-y-2">
            <CardTitle>{ready ? app?.name : 'Loading...'}</CardTitle>
            <CardDescription>
              {ready ? app?.description : 'Loading app metadata...'}
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>Use shadcn surfaces and portal tokens so the app feels native inside Notis.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No items yet. Deploy the app and create some.
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc.id} className="rounded-xl border border-border bg-background px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{doc.title}</p>
                    {doc.properties.status ? (
                      <Badge variant="outline">{String(doc.properties.status)}</Badge>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
