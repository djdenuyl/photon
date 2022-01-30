"""
Main navigation sidebar for the app

Created on 2022-01-19

@author: David den Uyl (djdenuyl@gmail.nl)
"""
from tkinter import Frame
from components.counter import Counter
from handlers.file_handling import FileOpener, FileSaver, ImageImporter, NewFileCreator, ImageExporter


class Sidebar(Frame):
    """ Represents a GUI component that contains tools for editing the file """
    def __init__(self, container, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.container = container
        self.new = NewFileCreator(master=self, canvas=self.container, text='New File')
        self.open = FileOpener(master=self, canvas=self.container, text='Open File')
        self.save_as = FileSaver(master=self, canvas=self.container, text='Save File As')
        self._import = ImageImporter(master=self, canvas=self.container, text='Import Image')
        self._export = ImageExporter(master=self, canvas=self.container, text='Export Image')
        self.counter = Counter(master=self)

        self.layout()

    def layout(self):
        self.new.grid(row=0, column=0, sticky="ew", padx=5, pady=5)
        self.open.grid(row=1, column=0, sticky="ew", padx=5, pady=5)
        self.save_as.grid(row=2, column=0, sticky="ew", padx=5, pady=5)
        self._import.grid(row=3, column=0, sticky="ew", padx=5, pady=5)
        self._export.grid(row=4, column=0, sticky="ew", padx=5, pady=5)
        self.counter.grid(row=5, column=0, sticky="ew", padx=5, pady=5)
