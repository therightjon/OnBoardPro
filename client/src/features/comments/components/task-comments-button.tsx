import { Button } from '@/shared/components/ui/button';
import { MessageSquare } from 'lucide-react';

export function TaskCommentsButton({ count, onClick, ariaLabel }: { count: number; onClick: () => void; ariaLabel: string }) {
  return (
    <Button variant="ghost" size="icon" className="relative min-h-[36px] min-w-[36px]" onClick={onClick} aria-label={ariaLabel}>
      <MessageSquare className="w-4 h-4" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5" aria-hidden>
          {count}
        </span>
      )}
    </Button>
  );
}

