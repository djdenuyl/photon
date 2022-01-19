"""
main application class to run the program

author: David den Uyl (djdenuyl@gmail.com)
date: 2022-01-19
"""
from tkinter import Tk, Text
from model.sidebar import Sidebar


NAME = 'Photon Editor - v0.0'


class Application(Tk):
    """ The application """
    def __init__(self, name=None):
        super().__init__()

        self.name = name or NAME
        self.title(self.name)

        self.editor = Text(master=self)
        self.sidebar = Sidebar(master=self, container=self.editor, app=self)

        self.layout()
        self.mainloop()

    def layout(self):
        self.rowconfigure(0, minsize=800, weight=1)
        self.columnconfigure(1, minsize=800, weight=1)

        self.sidebar.grid(row=0, column=0, sticky="ns")
        self.editor.grid(row=0, column=1, sticky="nsew")


if __name__ == '__main__':
    Application()
