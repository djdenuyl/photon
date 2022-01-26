"""
main application class to run the program

author: David den Uyl (djdenuyl@gmail.com)
date: 2022-01-19
"""
from tkinter import Tk
from typing import Callable
from model.main_canvas import MainCanvas
from model.sidebar import Sidebar


NAME = 'Photon Editor - v0.0'


class Application(Tk):
    """ The application """
    def __init__(self, name=None):
        super().__init__()

        self.name = name or NAME
        self.title(self.name)

        # init components
        self.canvas = MainCanvas(master=self, height=300, width=300, bg='white')
        self.sidebar = Sidebar(master=self, container=self.canvas)

        # init bindings
        self.on_event_do('<<FileUpdated>>', self.update_title)

        self.layout()
        self.mainloop()

    def layout(self):
        """ create the app layout """
        self.rowconfigure(0, minsize=800, weight=1)
        self.columnconfigure(1, minsize=800, weight=1)

        self.sidebar.grid(row=0, column=0, sticky="ns")
        self.canvas.grid(row=0, column=1, sticky="nsew")

    def update_title(self, event_content):
        """ update the title when file updated events occur"""
        self.title(f'{self.name}: {event_content}')

    def on_event_do(self, event: str, function: Callable):
        """ add event listener. trigger a function on event. similar to tk.bind but with the data param working """
        cmd = self.register(function)
        self.tk.call("bind", self, event, cmd + " %d")


if __name__ == '__main__':
    Application()
