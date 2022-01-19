"""
Handling of storage and retrieval of files

Created on 2022-01-19

@author: David den Uyl (ddenuyl@bebr.nl)
"""
from enum import Enum
from tkinter import Button, END
from tkinter.filedialog import askopenfilename, asksaveasfilename


DEFAULT_EXTENSION = '.txt'


class Extension(Enum):
    TEXT = ('Text Files', '*.txt')
    ALL = ('All File', '*.*')


class Opener(Button):
    """ Represents a GUI component that handles opening of files"""
    def __init__(self, container, app, *args, **kwargs):
        super().__init__(*args, **kwargs, command=self.open_file)
        self.container = container
        self.app = app

    def open_file(self):
        """Open a file for editing."""
        filepath = askopenfilename(filetypes=[e.value for e in Extension])

        if not filepath:
            return

        self.container.delete("1.0", END)
        with open(filepath, "r") as file:
            content = file.read()

        self.container.insert(END, content)

        # TODO: Can this be done with events so I dont have to pass the app to the button?
        self.app.title(f'{self.app.name} - {filepath}')


class Saver(Button):
    """ Represents a GUI component that handles saving of files """
    def __init__(self, container, app, *args, **kwargs):
        super().__init__(*args, **kwargs, command=self.save_file_as)
        self.container = container
        self.app = app

    def save_file_as(self):
        """Save the current file as a new file."""
        filepath = asksaveasfilename(
            defaultextension=DEFAULT_EXTENSION,
            filetypes=[e.value for e in Extension],
        )

        if not filepath:
            return

        with open(filepath, "w") as file:
            text = self.container.get("1.0", END)
            file.write(text)

        self.app.title(f'{self.app.name} - {filepath}')
