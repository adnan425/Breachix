import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export default function Home() {
  return (
    <div className="min-h-screen   px-4 py-10 sm:px-6 lg:px-8">
      <main className="mx-auto w-full max-w-4xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Scan Setup</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            One-page onboarding
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Configure your first white-box security scan in a single form. Start
            with required details, then optionally add authentication for private
            apps.
          </p>
        </header>

        <form className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Scan details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="targetUrl">
                  Target URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="targetUrl"
                  name="targetUrl"
                  type="url"
                  required
                  placeholder="https://staging.example.com"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="repoPath">
                  Source code location <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="repoPath"
                  name="repoPath"
                  required
                  placeholder="/Users/you/projects/my-app or git@github.com:org/repo.git"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="environment">
                  Environment <span className="text-destructive">*</span>
                </Label>
                <Select name="environment" defaultValue="staging" required>
                  <SelectTrigger id="environment" className="h-10 w-full">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workspaceName">Workspace name</Label>
                <Input
                  id="workspaceName"
                  name="workspaceName"
                  placeholder="q2-security-audit"
                />
              </div>
            </CardContent>
          </Card>
 

       
            <Button className="w-full bg-blue-500 text-white"   type="submit">Start scan</Button>
        </form>
      </main>
    </div>
  );
}
