# If This Portal Were Deployed to AWS

## Submission boundary

This repository is container-ready and includes Docker Compose for local use. I
do not have an AWS account available for this submission, so no AWS
infrastructure is deployed. This document explains the services I would use and
the production design I would implement for the same application.

## Architecture I would use

```text
GitHub Actions -- OIDC --> Amazon ECR --> Amazon ECS Fargate service
                                          |
Internet --> Route 53 --> ALB + ACM ------+--> Node.js / Express container
                                                    |
                                             Amazon RDS PostgreSQL

CloudWatch <------------------------------- ECS logs, metrics, alarms
Secrets Manager --------------------------> database and runtime secrets
```

The current Docker image packages the React frontend and Express API together.
I would place it behind an Application Load Balancer (ALB), which would route
HTTPS traffic to an ECS Fargate service. Fargate would keep the existing Node.js
application model intact while removing host and cluster administration.

## Core services

| Concern | AWS service I would use | Proposed design |
| --- | --- | --- |
| Container image | Amazon ECR | CI would publish immutable images tagged with the commit SHA. |
| Application runtime | Amazon ECS on Fargate | I would run at least two API tasks across private subnets and scale on CPU, memory, and request load. |
| Public traffic | Application Load Balancer + ACM | I would terminate TLS at the ALB and route traffic to healthy tasks using `/api/health`. |
| Database | Amazon RDS for PostgreSQL | I would replace SQLite with PostgreSQL for concurrent access, backups, point-in-time recovery, and safe horizontal scaling. |
| Secrets | AWS Secrets Manager | Tasks would receive database credentials, session signing configuration, and external integration settings at startup. |
| DNS | Amazon Route 53 | I would map the production domain to the load balancer. |
| Observability | Amazon CloudWatch | I would centralise structured logs, service metrics, dashboards, and alarms. |

## Networking and security

- I would place the ALB in public subnets and ECS tasks plus RDS in private subnets.
- I would allow inbound internet traffic only to the ALB on HTTPS. The ECS
  security group would receive traffic only from the ALB; RDS would accept traffic
  only from ECS.
- I would use a managed identity provider such as Amazon Cognito or the bank's
  existing OIDC provider. The seeded demo login and browser session storage in
  this submission are intentionally limited to local demonstration.
- I would store session and credential material outside the image, using
  short-lived task roles and GitHub Actions OIDC rather than static AWS keys.
- I would enable encryption in transit with ACM certificates and encryption at
  rest for RDS, ECR, CloudWatch Logs, and Secrets Manager.
- I would apply request-size limits, strict CORS rules, security headers, and rate
  limits at the application and edge layers.

## Data and resilience

SQLite is appropriate for this self-contained take-home, but it is not suitable
for a multi-task production service. I would use PostgreSQL as the source of
truth for customers, accounts, transactions, disputes, sessions, and audit events.

I would use Multi-AZ deployment, automated backups, point-in-time recovery, and
monitored connection limits. Schema changes would be delivered as versioned
migrations before a compatible application rollout. ECS deployments would use
rolling or blue/green deployment with health checks and rollback on failed tasks.

## Background processing and Lambda

I would run the core portal API as an ECS Fargate service, not a Lambda function.
It is a long-running Express application already designed as a Docker container.

I would use Lambda for isolated, event-driven work added later, for example:

- send a dispute status notification after a case event is published
- run scheduled reminders for cases awaiting customer action
- process uploaded evidence after it lands in S3

Those flows could use EventBridge or SQS to decouple the API from slow or
retryable work. No Lambda function is claimed or implemented in this submission.

## Delivery pipeline

The existing GitHub Actions workflow validates every push with a clean install,
type check, tests, and production build. If AWS were available, I would extend it
into a deployment pipeline as follows:

1. GitHub Actions authenticates to AWS using OIDC and a least-privilege IAM role.
2. The verified Docker image is built and pushed to ECR with the commit SHA tag.
3. Database migrations run as a controlled one-off ECS task.
4. The ECS service is updated to the new immutable image.
5. CloudWatch alarms and ALB health checks determine rollout success; failed
   deployments roll back automatically.

## Operations

I would carry a correlation ID through structured JSON logs. CloudWatch alarms
would notify the team about elevated 5xx rates, authentication failures, latency,
ECS task restarts, and RDS capacity pressure. Runbooks would cover rollback,
database recovery, customer-session incidents, and third-party API failures.
