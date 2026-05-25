import { useEffect } from "react";
import { SignIn, useUser } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { Layout } from "@/components/Layout";

export default function Auth() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate("/admin");
    }
  }, [isLoaded, isSignedIn, navigate]);

  return (
    <Layout>
      <SEO title="Sign in — PassivePress Admin" description="Sign in to the PassivePress editor." />
      <div className="container max-w-md py-20">
        <h1 className="font-display text-4xl font-extrabold mb-2">Sign in</h1>
        <p className="text-muted-foreground mb-8">Editor & admin access.</p>
        <div className="flex justify-center">
          <SignIn path="/auth" routing="path" forceRedirectUrl="/admin" fallbackRedirectUrl="/admin" />
        </div>
      </div>
    </Layout>
  );
}
