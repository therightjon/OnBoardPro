import { Button } from '@/shared/components/ui/button';
import { MessageSquare } from 'lucide-react';

export function TaskCommentsButton({ count, onClick, ariaLabel }: { count: number; onClick: () => void; ariaLabel: string }) {
  const computedAria = `${ariaLabel}${count ? `, ${count} comments` : ''}`;
  return (
    <>
      {/* Desktop/tablet: icon button with badge */}
      <Button
        variant="ghost"
        size="icon"
        className="relative min-h-[36px] min-w-[36px] hidden md:inline-flex"
        onClick={onClick}
        aria-label={computedAria}
        data-testid="button-task-comments-desktop"
      >
        <MessageSquare className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5" aria-hidden>
            {count}
          </span>
        )}
      </Button>

      {/* Mobile: text button showing count */}
      <Button
        variant="ghost"
        size="sm"
        className="min-h-[44px] md:hidden"
        onClick={onClick}
        aria-label={computedAria}
        data-testid="button-task-comments-mobile"
      >
        {`Comments${count ? ` (${count})` : ''}`}
      </Button>
    </>
  );
}
