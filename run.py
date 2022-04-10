"""
Run the program

author: David den Uyl (djdenuyl@gmail.com)
date: 2022-01-19
"""
from logging import basicConfig, DEBUG, StreamHandler
from components.application import Application


if __name__ == '__main__':
    basicConfig(
        level=DEBUG,
        handlers=[
            StreamHandler()
        ],
        force=True
    )

    app = Application()
