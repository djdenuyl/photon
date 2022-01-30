"""
A component with a increment and decrement button and a display of the value

author: David den Uyl (djdenuyl@gmail.com)
date: 2022-01-19
"""
from tkinter import Frame, Button, Label


class Counter(Frame):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.value = 0

        self.incrementer = Button(master=self, text='+', command=self.increment)
        self.decrementer = Button(master=self, text='-', command=self.decrement)

        self.label = Label(master=self, text=self.value)

        self.layout()

    def layout(self):
        self.rowconfigure(0, minsize=50, weight=1)
        self.columnconfigure(list(range(3)), minsize=50, weight=1)

        self.decrementer.grid(row=0, column=0, sticky='nsew')
        self.label.grid(row=0, column=1)
        self.incrementer.grid(row=0, column=2, sticky='nsew')

    def increment(self):
        self.value += 1
        self.label['text'] = self.value

    def decrement(self):
        self.value -= 1
        self.label['text'] = self.value
