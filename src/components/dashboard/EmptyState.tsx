import { Card, CardContent, CardHeader, CardTitle } from '@fx/ui';
import { TypedButton } from '~/components/shared/TypedButton';

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
            <a href="/upload" className="flex-1">
              <TypedButton variant="default" className="w-full">
                Upload Addon Data
              </TypedButton>
            </a>
            <TypedButton
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Refresh
            </TypedButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
