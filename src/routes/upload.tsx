import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState, useCallback, useRef } from 'react';
import { Button, Card, CardContent } from '@fx/ui';
import { uploadAddonData } from '~/server/functions/upload';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/upload')({
  component: UploadPage,
});

function UploadPage() {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [charCount, setCharCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.lua')) {
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

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

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

      <input
        ref={fileInputRef}
        type="file"
        accept=".lua"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      <Card
        className={cn(
          'border-2 border-dashed p-12 text-center cursor-pointer transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50',
          status === 'done' && 'border-emerald-500/50 bg-emerald-500/5',
          status === 'error' && 'border-red-500/50 bg-red-500/5',
        )}
        role="button"
        tabIndex={0}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openFilePicker();
          }
        }}
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
        onClick={openFilePicker}
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
          <Button onClick={() => router.navigate({ to: '/' })}>
            Back to Dashboard
          </Button>
        )}
        {(status === 'done' || status === 'error') && (
          <Button variant="outline" onClick={() => setStatus('idle')}>
            Upload Another
          </Button>
        )}
      </div>
    </div>
  );
}
