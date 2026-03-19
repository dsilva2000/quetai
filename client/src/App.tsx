import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import ChatPage from "@/pages/ChatPage";
import AdminPage from "@/pages/AdminPage";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/" component={ChatPage} />
          <Route path="/admin" component={AdminPage} />
          <Route component={ChatPage} />
        </Switch>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
