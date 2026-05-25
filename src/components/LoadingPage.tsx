import { Layout } from "@/components/Layout";

interface LoadingPageProps {
  message?: string;
}

/**
 * Shared loading/access-check page — renders a centered message inside Layout.
 * Used by Admin and PostEditor while role is being confirmed.
 */
export function LoadingPage({ message = "Checking access…" }: LoadingPageProps) {
  return (
    <Layout>
      <div className="container py-20 text-center text-muted-foreground">
        {message}
      </div>
    </Layout>
  );
}
