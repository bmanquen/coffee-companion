import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Sheet, SheetTrigger, SheetContent } from './ui/sheet'
import { Button } from './ui/button'

export default function Navigation() {
  return (
    <Sheet modal={false}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 px-2">
        <nav className="flex flex-col gap-2 mt-10">
          <a className="hover:bg-primary p-2 rounded-sm" href="/">
            Home
          </a>
          <a className="hover:bg-primary p-2 rounded-sm" href="">
            Coffee
          </a>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
