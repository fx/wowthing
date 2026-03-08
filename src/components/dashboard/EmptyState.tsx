import { Button, Card, CardContent, CardHeader, CardTitle } from '@fx/ui';

export function EmptyState() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>No characters yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload your addon data or sync your Battle.net account to see your
            characters here.
          </p>
          <div className="flex gap-2">
            <Button
              variant="default"
              className="w-full flex-1"
              onClick={() => {
                window.location.href = '/upload';
              }}
            >
              Upload Addon Data
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
