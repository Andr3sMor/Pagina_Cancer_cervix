import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {
  examples = [
    { src: 'images/Ejemplo1.png', title: 'Ejemplo 1' },
    { src: 'images/Ejemplo2.png', title: 'Ejemplo 2' },
    { src: 'images/Ejemplo3.png', title: 'Ejemplo 3' }
  ];
}
