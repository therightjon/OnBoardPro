import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { ChartBar, TrendingUp, Users, Clock, AlertTriangle, CheckCircle } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div className="p-4 sm:p-6 space-y-4 xs:space-y-5 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-foreground" data-testid="text-analytics-title">Analytics</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Insights and performance metrics for your hiring pipeline</p>
        </div>
        <Button variant="outline" className="w-full sm:w-auto" data-testid="button-export-analytics">
          Export Report
        </Button>
      </div>

      {/* Coming Soon Message */}
      <Card className="border-dashed border-2 border-muted">
        <CardContent className="p-12">
          <div className="text-center space-y-6">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <ChartBar className="w-12 h-12 text-primary" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Analytics Coming Soon</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                We're building comprehensive analytics and reporting features to help you gain insights into your hiring pipeline performance.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto mt-8">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mx-auto">
                  <TrendingUp className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-medium">Performance Trends</h3>
                <p className="text-sm text-muted-foreground">Track hiring velocity and completion rates over time</p>
              </div>
              
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-chart-3/10 rounded-lg flex items-center justify-center mx-auto">
                  <Users className="w-6 h-6 text-chart-3" />
                </div>
                <h3 className="font-medium">Team Insights</h3>
                <p className="text-sm text-muted-foreground">Analyze team workload and task distribution</p>
              </div>
              
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-chart-5/10 rounded-lg flex items-center justify-center mx-auto">
                  <Clock className="w-6 h-6 text-chart-5" />
                </div>
                <h3 className="font-medium">Time Analysis</h3>
                <p className="text-sm text-muted-foreground">Identify bottlenecks and optimize processes</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Placeholder Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="opacity-50">
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="w-4 h-4 mr-2" />
              Hiring Pipeline Velocity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 bg-muted/50 rounded-lg flex items-center justify-center">
              <p className="text-muted-foreground">Chart placeholder</p>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-50">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="w-4 h-4 mr-2" />
              Team Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 bg-muted/50 rounded-lg flex items-center justify-center">
              <p className="text-muted-foreground">Chart placeholder</p>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-50">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Clock className="w-4 h-4 mr-2" />
              Average Time by Stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 bg-muted/50 rounded-lg flex items-center justify-center">
              <p className="text-muted-foreground">Chart placeholder</p>
            </div>
          </CardContent>
        </Card>

        <Card className="opacity-50">
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle className="w-4 h-4 mr-2" />
              Completion Rates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 bg-muted/50 rounded-lg flex items-center justify-center">
              <p className="text-muted-foreground">Chart placeholder</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Future Features List */}
      <Card>
        <CardHeader>
          <CardTitle>Planned Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">Real-time dashboard widgets</span>
            </div>
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">Custom date range filtering</span>
            </div>
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">Department-wise analytics</span>
            </div>
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">Task completion forecasting</span>
            </div>
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">Automated report scheduling</span>
            </div>
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm">Performance benchmarking</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
