import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

const Index = lazy(() => import("./pages/Index"));
const Post = lazy(() => import("./pages/Post"));
const Category = lazy(() => import("./pages/Category"));
const About = lazy(() => import("./pages/About"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Auth = lazy(() => import("./pages/Auth"));
const Admin = lazy(() => import("./pages/Admin"));
const PostEditor = lazy(() => import("./pages/PostEditor"));

const RouteLoading = () => (
  <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
    <div className="text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">Loading</p>
      <p className="text-muted-foreground">Preparing page…</p>
    </div>
  </div>
);

const App = () => (
  <AppErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider>
        <Sonner />
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/:slug" element={<Post />} />
            <Route path="/category/:slug" element={<Category />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/auth/*" element={<Auth />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/new" element={<PostEditor />} />
            <Route path="/admin/edit/:id" element={<PostEditor />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </TooltipProvider>
    </ThemeProvider>
  </AppErrorBoundary>
);

export default App;

