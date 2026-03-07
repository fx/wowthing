import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState, useCallback } from 'react';
import { Card, CardContent } from '@fx/ui';
import { TypedButton } from '~/components/shared/TypedButton';
import { authClient } from '~/lib/auth/client';
import { uploadAddonData } from '~/server/functions/upload';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/upload')({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw new Error('Not authenticated');
    }
  },
  component: UploadPage,
});

function UploadPage() {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [charCount, setCharCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const router = useRouter();

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.lua')) {
        setStatus('error');
        setErrorMessage('Only .lua files are accepted');
        return;
      }
      setStatus('uploading');
      try {
        const luaText = await file.text();
        const result = await uploadAddonData({ data: { luaText } });
        setStatus('done');
        setCharCount(result.characterCount);
        router.invalidate();
      } catch {
        setStatus('error');
        setErrorMessage('Upload failed. Check file format and try again.');
      }
    },
    [router],
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Upload Addon Data</h1>
      <p className="text-muted-foreground">
        Upload your{' '}
        <code className="text-sm bg-muted px-1 py-0.5 rounded">
          WoWthing_Collector.lua
        </code>{' '}
        file from:
      </p>
      <code className="block text-xs text-muted-foreground bg-muted p-3 rounded-lg">
        WoW/WTF/Account/YOUR_ACCOUNT/SavedVariables/WoWthing_Collector.lua
      </code>

      <Card
        className={cn(
          'border-2 border-dashed p-12 text-center cursor-pointer transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50',
          status === 'done' && 'border-emerald-500/50 bg-emerald-500/5',
          status === 'error' && 'border-red-500/50 bg-red-500/5',
        )}
        onDragOver={(e: React.DragEvent) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e: React.DragEvent) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.lua';
          input.onchange = () => input.files?.[0] && handleFile(input.files[0]);
          input.click();
        }}
      >
        <CardContent className="p-0">
          {status === 'idle' && (
            <div className="space-y-2">
              <p className="text-lg">Drop .lua file here or click to browse</p>
              <p className="text-sm text-muted-foreground">
                Accepts WoWthing_Collector.lua files
              </p>
            </div>
          )}
          {status === 'uploading' && <p className="text-lg">Processing...</p>}
          {status === 'done' && (
            <div className="space-y-2">
              <p className="text-lg text-emerald-400">Upload complete!</p>
              <p className="text-sm text-muted-foreground">
                {charCount} characters processed
              </p>
            </div>
          )}
          {status === 'error' && (
            <div className="space-y-2">
              <p className="text-lg text-red-400">Upload failed</p>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        {status === 'done' && (
          <Link to="/">
            <TypedButton>Back to Dashboard</TypedButton>
          </Link>
        )}
        {(status === 'done' || status === 'error') && (
          <TypedButton variant="outline" onClick={() => setStatus('idle')}>
            Upload Another
          </TypedButton>
        )}
      </div>
    </div>
  );
}
