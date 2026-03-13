CREATE TABLE "coffee_processes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "coffee_processes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "coffees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"roaster_name" text,
	"roast_level" text,
	"roastDate" date,
	"country" text,
	"region" text,
	"process_id" uuid,
	"notes" text,
	"is_active" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "coffees_varieties" (
	"variety_id" uuid NOT NULL,
	"coffee_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "coffees_varieties_coffee_id_variety_id_pk" PRIMARY KEY("coffee_id","variety_id")
);
--> statement-breakpoint
CREATE TABLE "green_coffees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"region" text,
	"farm" text,
	"producer" text,
	"process_id" uuid,
	"altitude" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "green_coffees_varieties" (
	"variety_id" uuid NOT NULL,
	"green_coffee_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "green_coffees_varieties_green_coffee_id_variety_id_pk" PRIMARY KEY("green_coffee_id","variety_id")
);
--> statement-breakpoint
CREATE TABLE "varieties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "varieties_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffees" ADD CONSTRAINT "coffees_process_id_coffee_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."coffee_processes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffees_varieties" ADD CONSTRAINT "coffees_varieties_variety_id_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."varieties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coffees_varieties" ADD CONSTRAINT "coffees_varieties_coffee_id_coffees_id_fk" FOREIGN KEY ("coffee_id") REFERENCES "public"."coffees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "green_coffees" ADD CONSTRAINT "green_coffees_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "green_coffees" ADD CONSTRAINT "green_coffees_process_id_coffee_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."coffee_processes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "green_coffees_varieties" ADD CONSTRAINT "green_coffees_varieties_variety_id_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."varieties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "green_coffees_varieties" ADD CONSTRAINT "green_coffees_varieties_green_coffee_id_green_coffees_id_fk" FOREIGN KEY ("green_coffee_id") REFERENCES "public"."green_coffees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coffee_processes_name_idx" ON "coffee_processes" USING btree ("name");--> statement-breakpoint
CREATE INDEX "coffees_user_idx" ON "coffees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coffees_user_name_idx" ON "coffees" USING btree ("name","user_id");--> statement-breakpoint
CREATE INDEX "coffees_user_process_id_idx" ON "coffees" USING btree ("process_id","user_id");--> statement-breakpoint
CREATE INDEX "coffess_user_country_idx" ON "coffees" USING btree ("country","user_id");--> statement-breakpoint
CREATE INDEX "green_coffees_user_idx" ON "green_coffees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "green_coffees_user_name_idx" ON "green_coffees" USING btree ("name","user_id");--> statement-breakpoint
CREATE INDEX "green_coffees_user_process_id_idx" ON "green_coffees" USING btree ("process_id","user_id");--> statement-breakpoint
CREATE INDEX "green_coffees_user_country_idx" ON "green_coffees" USING btree ("country","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "varieties_name_idx" ON "varieties" USING btree ("name");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");