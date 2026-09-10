import { createFileRoute } from '@tanstack/react-router'
import type { Recipient } from '@/lib/privacy'
import { H1 } from '@/components/typography/h1'
import { Card } from '@/components/ui/card'
import { marketingHead } from '@/lib/marketing-head'
import { recipients } from '@/lib/privacy'

const TITLE = 'Privacy — Coffee Companion'
const DESCRIPTION =
  'Every company Coffee Companion sends data to, exactly what each one receives, how long they keep it, and why we send it at all.'

export const Route = createFileRoute('/_marketing/privacy')({
  head: () =>
    marketingHead({ title: TITLE, description: DESCRIPTION, path: '/privacy' }),
  component: PrivacyPage,
})

export function PrivacyPage() {
  return (
    <div className="flex flex-col gap-10 py-12">
      <header className="flex flex-col gap-4">
        <H1>What we collect, and who we send it to</H1>
        <p className="max-w-2xl text-muted-foreground">
          Your brewing log is yours. Nothing in it — no coffee, no roaster, no
          tasting note — is ever sent to anyone else. A handful of companies do
          receive something, and this page names every one of them, what each
          gets, for how long, and why.
        </p>
      </header>

      {recipients.map((recipient) => (
        <RecipientSection key={recipient.slug} recipient={recipient} />
      ))}

      <Section id="session-replay" title="Session replay">
        <p className="text-muted-foreground">
          Sentry can record what happened in the browser just before a crash, so
          a bug report comes with the steps that caused it. We use it{' '}
          <strong className="font-medium text-foreground">
            only when the app throws an error
          </strong>
          , and{' '}
          <strong className="font-medium text-foreground">
            never for an ordinary visit
          </strong>
          . If nothing goes wrong, nothing is sent and the recording is
          discarded as you go.
        </p>
        <p className="text-muted-foreground">
          A replay is not a video of your screen.{' '}
          <strong className="font-medium text-foreground">
            Every piece of text on the page is masked
          </strong>
          , every field you type into is masked, and images and video are
          blocked outright. What survives is the shape of the page and where you
          clicked — boxes and timing, not their contents.
        </p>
      </Section>

      <Section id="your-data" title="Your own data">
        <p className="text-muted-foreground">
          Everything the app holds about you can be exported from your account
          page, on any plan and whatever a plan hides from view. There is no
          button that deletes your account yet — until there is, write to us and
          we will do it by hand.
        </p>
      </Section>
    </div>
  )
}

function Section({
  id,
  title,
  children,
  className = 'max-w-2xl',
}: {
  id: string
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      aria-labelledby={id}
      className={`flex flex-col gap-3 ${className}`}
    >
      <h2 id={id} className="text-2xl font-bold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  )
}

function RecipientSection({ recipient }: { recipient: Recipient }) {
  return (
    <Section id={recipient.slug} title={recipient.name} className="">
      <p className="max-w-2xl text-muted-foreground">{recipient.purpose}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <ItemList title="What it receives" items={recipient.receives} />
        <ItemList
          title="What it never receives"
          items={recipient.neverReceives}
        />
      </div>

      <Card className="flex max-w-2xl flex-col gap-3 p-4 text-sm">
        <Fact label="How long it is kept">{recipient.retention}</Fact>
        <Fact label="Why we are allowed to send it">
          {recipient.lawfulBasis}
        </Fact>
        <a
          href={recipient.policyUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-muted-foreground underline hover:text-foreground"
        >
          {recipient.name}'s privacy policy
        </a>
      </Card>
    </Section>
  )
}

function ItemList({ title, items }: { title: string; items: Array<string> }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <p className="flex flex-col gap-1">
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">{children}</span>
    </p>
  )
}
