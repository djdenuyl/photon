"""
Main navigation sidebar for the app

Created on 2022-01-19

@author: David den Uyl (djdenuyl@gmail.nl)
"""
from tkinter import Frame
from components.counter import Counter
from handlers.file_handling import Opener, Saver


class Sidebar(Frame):
    """ Represents a GUI component that contains tools for editing the file """
    def __init__(self, container, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.container = container
        self.open = Opener(master=self, container=self.container, text='Open')
        self.save_as = Saver(master=self, container=self.container, text='Save As')
        self.counter = Counter(master=self)

        self.layout()

    def layout(self):
        self.open.grid(row=0, column=0, sticky="ew", padx=5, pady=5)
        self.save_as.grid(row=1, column=0, sticky="ew", padx=5, pady=5)
        self.counter.grid(row=2, column=0, sticky="ew", padx=5, pady=5)
