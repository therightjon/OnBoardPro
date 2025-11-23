import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';

describe('Card Components', () => {
  describe('Card', () => {
    it('renders children correctly', () => {
      render(<Card data-testid="card">Card content</Card>);

      const card = screen.getByTestId('card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveTextContent('Card content');
    });

    it('applies default classes', () => {
      render(<Card data-testid="card">Content</Card>);

      const card = screen.getByTestId('card');
      expect(card).toHaveClass('rounded-lg');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('bg-card');
      expect(card).toHaveClass('text-card-foreground');
      expect(card).toHaveClass('shadow-sm');
    });

    it('accepts custom className', () => {
      render(<Card data-testid="card" className="custom-class">Content</Card>);

      const card = screen.getByTestId('card');
      expect(card).toHaveClass('custom-class');
      expect(card).toHaveClass('rounded-lg'); // Still has default classes
    });

    it('forwards ref correctly', () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Card ref={ref}>Content</Card>);

      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it('spreads additional props', () => {
      render(<Card data-testid="card" aria-label="Test card">Content</Card>);

      const card = screen.getByTestId('card');
      expect(card).toHaveAttribute('aria-label', 'Test card');
    });
  });

  describe('CardHeader', () => {
    it('renders children correctly', () => {
      render(<CardHeader data-testid="header">Header content</CardHeader>);

      const header = screen.getByTestId('header');
      expect(header).toBeInTheDocument();
      expect(header).toHaveTextContent('Header content');
    });

    it('applies default classes', () => {
      render(<CardHeader data-testid="header">Content</CardHeader>);

      const header = screen.getByTestId('header');
      expect(header).toHaveClass('flex');
      expect(header).toHaveClass('flex-col');
      expect(header).toHaveClass('space-y-1.5');
      expect(header).toHaveClass('p-6');
    });

    it('accepts custom className', () => {
      render(<CardHeader data-testid="header" className="custom-header">Content</CardHeader>);

      const header = screen.getByTestId('header');
      expect(header).toHaveClass('custom-header');
    });
  });

  describe('CardTitle', () => {
    it('renders children correctly', () => {
      render(<CardTitle data-testid="title">Title text</CardTitle>);

      const title = screen.getByTestId('title');
      expect(title).toBeInTheDocument();
      expect(title).toHaveTextContent('Title text');
    });

    it('applies default typography classes', () => {
      render(<CardTitle data-testid="title">Title</CardTitle>);

      const title = screen.getByTestId('title');
      expect(title).toHaveClass('text-2xl');
      expect(title).toHaveClass('font-semibold');
      expect(title).toHaveClass('leading-none');
      expect(title).toHaveClass('tracking-tight');
    });

    it('accepts custom className', () => {
      render(<CardTitle data-testid="title" className="text-3xl">Title</CardTitle>);

      const title = screen.getByTestId('title');
      expect(title).toHaveClass('text-3xl');
    });
  });

  describe('CardDescription', () => {
    it('renders children correctly', () => {
      render(<CardDescription data-testid="description">Description text</CardDescription>);

      const description = screen.getByTestId('description');
      expect(description).toBeInTheDocument();
      expect(description).toHaveTextContent('Description text');
    });

    it('applies default classes', () => {
      render(<CardDescription data-testid="description">Text</CardDescription>);

      const description = screen.getByTestId('description');
      expect(description).toHaveClass('text-sm');
      expect(description).toHaveClass('text-muted-foreground');
    });

    it('accepts custom className', () => {
      render(<CardDescription data-testid="description" className="text-base">Text</CardDescription>);

      const description = screen.getByTestId('description');
      expect(description).toHaveClass('text-base');
    });
  });

  describe('CardContent', () => {
    it('renders children correctly', () => {
      render(<CardContent data-testid="content">Main content</CardContent>);

      const content = screen.getByTestId('content');
      expect(content).toBeInTheDocument();
      expect(content).toHaveTextContent('Main content');
    });

    it('applies default padding classes', () => {
      render(<CardContent data-testid="content">Content</CardContent>);

      const content = screen.getByTestId('content');
      expect(content).toHaveClass('p-6');
      expect(content).toHaveClass('pt-0');
    });

    it('accepts custom className', () => {
      render(<CardContent data-testid="content" className="p-4">Content</CardContent>);

      const content = screen.getByTestId('content');
      expect(content).toHaveClass('p-4');
    });
  });

  describe('CardFooter', () => {
    it('renders children correctly', () => {
      render(<CardFooter data-testid="footer">Footer content</CardFooter>);

      const footer = screen.getByTestId('footer');
      expect(footer).toBeInTheDocument();
      expect(footer).toHaveTextContent('Footer content');
    });

    it('applies default classes', () => {
      render(<CardFooter data-testid="footer">Footer</CardFooter>);

      const footer = screen.getByTestId('footer');
      expect(footer).toHaveClass('flex');
      expect(footer).toHaveClass('items-center');
      expect(footer).toHaveClass('p-6');
      expect(footer).toHaveClass('pt-0');
    });

    it('accepts custom className', () => {
      render(<CardFooter data-testid="footer" className="justify-end">Footer</CardFooter>);

      const footer = screen.getByTestId('footer');
      expect(footer).toHaveClass('justify-end');
    });
  });

  describe('Complete Card composition', () => {
    it('renders all card parts together', () => {
      render(
        <Card data-testid="complete-card">
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card description</CardDescription>
          </CardHeader>
          <CardContent>
            Main card content
          </CardContent>
          <CardFooter>
            Footer actions
          </CardFooter>
        </Card>
      );

      const card = screen.getByTestId('complete-card');
      expect(card).toHaveTextContent('Card Title');
      expect(card).toHaveTextContent('Card description');
      expect(card).toHaveTextContent('Main card content');
      expect(card).toHaveTextContent('Footer actions');
    });

    it('maintains proper structure and hierarchy', () => {
      const { container } = render(
        <Card>
          <CardHeader>
            <CardTitle>Title</CardTitle>
          </CardHeader>
          <CardContent>Content</CardContent>
        </Card>
      );

      // Verify nested structure
      const header = container.querySelector('.flex.flex-col');
      const title = container.querySelector('.text-2xl');
      const content = container.querySelector('.p-6.pt-0');

      expect(header).toBeInTheDocument();
      expect(title).toBeInTheDocument();
      expect(content).toBeInTheDocument();
    });

    it('handles complex content', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>User Profile</CardTitle>
            <CardDescription>Manage your profile information</CardDescription>
          </CardHeader>
          <CardContent>
            <form>
              <input type="text" placeholder="Name" />
              <input type="email" placeholder="Email" />
            </form>
          </CardContent>
          <CardFooter>
            <button type="submit">Save Changes</button>
          </CardFooter>
        </Card>
      );

      expect(screen.getByText('User Profile')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });
  });
});
