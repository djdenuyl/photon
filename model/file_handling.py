"""
Handling of storage and retrieval of files

Created on 2022-01-19

@author: David den Uyl (ddenuyl@bebr.nl)
"""
from enum import Enum
from tkinter import Button, PhotoImage
from tkinter.filedialog import askopenfilename, asksaveasfilename


DEFAULT_EXTENSION = '.png'


class Extension(Enum):
    PNG = ('PNG Files', '*.png')
    ALL = ('All File', '*.*')


class Opener(Button):
    """ Represents a GUI component that handles opening of files"""
    def __init__(self, container, *args, **kwargs):
        super().__init__(*args, **kwargs, command=self.open_file)
        self.container = container

    def open_file(self):
        """Open a file for editing."""
        filepath = askopenfilename(filetypes=[e.value for e in Extension])

        if not filepath:
            return

        # delete the current image
        self.container.delete(self.container.canvas_image)

        # load the new image
        self.container.image = PhotoImage(file=filepath)

        # display the image on the canvas
        self.container.canvas_image = self.container.create_image(150, 100, image=self.container.image)

        # fire an file updated event
        self.event_generate('<<FileUpdated>>', data=filepath, when='tail')


class Saver(Button):
    """ Represents a GUI component that handles saving of files """
    def __init__(self, container, *args, **kwargs):
        super().__init__(*args, **kwargs, command=self.save_file_as)
        self.container = container

    def save_file_as(self):
        """Save the current file as a new file."""
        filepath = asksaveasfilename(
            defaultextension=DEFAULT_EXTENSION,
            filetypes=[e.value for e in Extension],
        )

        if not filepath:
            return

        # save image
        self.container.image.write(filepath, format='png')

        # fire an file updated event
        self.event_generate('<<FileUpdated>>', data=filepath, when='tail')
